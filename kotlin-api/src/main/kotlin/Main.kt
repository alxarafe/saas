import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.response.*
import io.ktor.server.request.*
import io.ktor.server.routing.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.plugins.contentnegotiation.*
import kotlinx.serialization.json.*
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import java.sql.SQLException
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

fun hmacSha256(data: String, secret: String): String {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
    return Base64.getUrlEncoder().withoutPadding()
        .encodeToString(mac.doFinal(data.toByteArray(Charsets.UTF_8)))
}

fun createToken(sub: String, email: String, secret: String): String {
    val header = Base64.getUrlEncoder().withoutPadding()
        .encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray(Charsets.UTF_8))
    val payload = Base64.getUrlEncoder().withoutPadding()
        .encodeToString("""{"sub":"$sub","email":"$email"}""".toByteArray(Charsets.UTF_8))
    val sig = hmacSha256("$header.$payload", secret)
    return "$header.$payload.$sig"
}

fun parseToken(token: String, secret: String): Map<String, String>? {
    try {
        val parts = token.split(".")
        if (parts.size != 3) return null
        val sig = hmacSha256("${parts[0]}.${parts[1]}", secret)
        if (sig != parts[2]) return null
        val payload = Base64.getUrlDecoder().decode(parts[1]).decodeToString()
        val map = mutableMapOf<String, String>()
        val fields = payload.trimStart('{').trimEnd('}').split(",")
        for (f in fields) {
            val kv = f.split(":", limit = 2)
            if (kv.size == 2) {
                val key = kv[0].trim().trim('"')
                val value = kv[1].trim().trim('"')
                map[key] = value
            }
        }
        return map
    } catch (e: Exception) {
        return null
    }
}

val dataSource: HikariDataSource = HikariDataSource(HikariConfig().apply {
    jdbcUrl = "jdbc:postgresql://${System.getenv("DB_HOST") ?: "postgres"}:${System.getenv("DB_PORT") ?: "5432"}/${System.getenv("DB_NAME") ?: "saas"}"
    username = System.getenv("DB_USER") ?: "saas"
    password = System.getenv("DB_PASSWORD") ?: "saas"
    maximumPoolSize = 10
})

fun initSchema() {
    dataSource.connection.use { conn ->
        conn.createStatement().use { st ->
            st.execute(
                "CREATE TABLE IF NOT EXISTS users (" +
                    "id BIGSERIAL PRIMARY KEY, " +
                    "email TEXT NOT NULL UNIQUE, " +
                    "password_hash TEXT NOT NULL, " +
                    "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )
        }
    }
}

fun errorJson(code: String): JsonObject = buildJsonObject {
    putJsonObject("error") { put("code", code) }
}

fun validationJson(details: List<Pair<String, String>>): JsonObject = buildJsonObject {
    putJsonObject("error") {
        put("code", "validation_error")
        putJsonArray("details") {
            for ((field, code) in details) addJsonObject {
                put("field", field)
                put("code", code)
            }
        }
    }
}

fun userJson(id: Long, email: String, createdAt: java.sql.Timestamp): JsonObject = buildJsonObject {
    put("id", id)
    put("email", email)
    put("created_at", createdAt.toInstant().toString())
}

fun checkField(details: MutableList<Pair<String, String>>, path: String, value: JsonElement?) {
    when {
        value == null || value is JsonNull ||
            (value is JsonPrimitive && value.isString && value.content.isBlank()) ->
            details += (path to "required")
        value !is JsonPrimitive || !value.isString ->
            details += (path to "invalid_type")
    }
}

fun main() {
    runCatching { initSchema() }

    embeddedServer(Netty, host = "0.0.0.0", port = 3000) {

        install(ContentNegotiation) { json() }

        routing {
            get("/health") {
                call.respond(mapOf("status" to "ok"))
            }

            post("/auth/login") {
                try {
                    val body = call.receive<JsonObject>()
                    val details = mutableListOf<Pair<String, String>>()
                    checkField(details, "email", body["email"])
                    checkField(details, "password", body["password"])
                    if (details.isNotEmpty()) {
                        call.response.status(HttpStatusCode.UnprocessableEntity)
                        return@post call.respond(validationJson(details))
                    }
                    val email = (body["email"] as JsonPrimitive).content
                    val password = (body["password"] as JsonPrimitive).content
                    if (email != "admin@example.com" || password != "secret") {
                        call.response.status(HttpStatusCode.Unauthorized)
                        return@post call.respond(errorJson("invalid_credentials"))
                    }
                    val token = createToken("1", "admin@example.com", "secret")
                    call.respond(mapOf("data" to mapOf("token" to token)))
                } catch (e: Exception) {
                    call.response.status(HttpStatusCode.BadRequest)
                    call.respond(errorJson("bad_request"))
                }
            }

            get("/me") {
                try {
                    val auth = call.request.headers["Authorization"] ?: ""
                    if (auth.isBlank() || !auth.startsWith("Bearer ")) {
                        call.response.status(HttpStatusCode.Unauthorized)
                        return@get call.respond(errorJson("missing_token"))
                    }
                    val token = auth.removePrefix("Bearer ").trim()
                    val payload = parseToken(token, "secret")
                    if (payload == null) {
                        call.response.status(HttpStatusCode.Unauthorized)
                        return@get call.respond(errorJson("invalid_token"))
                    }
                    val id = payload["sub"] ?: ""
                    val email = payload["email"] ?: ""
                    call.respondText(
                        contentType = ContentType.Application.Json,
                        text = """{"data":{"id":${id},"email":"${email}"}}"""
                    )
                } catch (e: Exception) {
                    call.response.status(HttpStatusCode.InternalServerError)
                    call.respond(errorJson("internal_error"))
                }
            }

            post("/users/bulk") {
                try {
                    val body = call.receive<JsonObject>()
                    val data = body["data"]
                    if (data !is JsonArray) {
                        call.response.status(HttpStatusCode.UnprocessableEntity)
                        return@post call.respond(validationJson(listOf("data" to "invalid_type")))
                    }
                    val details = mutableListOf<Pair<String, String>>()
                    val users = mutableListOf<Map<String, String>>()
                    for ((i, item) in data.withIndex()) {
                        if (item !is JsonObject) {
                            details += ("data[$i]" to "invalid_type")
                            continue
                        }
                        users += mapOf(
                            "email" to (item["email"] as? JsonPrimitive)?.content.orEmpty(),
                            "password_hash" to (item["password_hash"] as? JsonPrimitive)?.content.orEmpty(),
                        )
                        checkField(details, "data[$i].email", item["email"])
                        checkField(details, "data[$i].password_hash", item["password_hash"])
                    }
                    if (details.isNotEmpty()) {
                        call.response.status(HttpStatusCode.UnprocessableEntity)
                        return@post call.respond(validationJson(details))
                    }
                    if (users.isEmpty()) {
                        call.response.status(HttpStatusCode.UnprocessableEntity)
                        return@post call.respond(validationJson(listOf("data" to "required")))
                    }

                    val created = mutableListOf<JsonObject>()
                    dataSource.connection.use { conn ->
                        conn.autoCommit = false
                        try {
                            conn.prepareStatement(
                                "INSERT INTO users (email, password_hash) VALUES (?, ?) " +
                                    "RETURNING id, email, created_at"
                            ).use { st ->
                                for (u in users) {
                                    st.setString(1, u["email"])
                                    st.setString(2, u["password_hash"])
                                    st.executeQuery().use { rs ->
                                        if (rs.next()) {
                                            created += userJson(rs.getLong("id"), rs.getString("email"), rs.getTimestamp("created_at"))
                                        }
                                    }
                                }
                            }
                            conn.commit()
                        } catch (e: SQLException) {
                            conn.rollback()
                            throw e
                        }
                    }
                    call.response.status(HttpStatusCode.Created)
                    call.respond(buildJsonObject {
                        putJsonArray("data") {
                            for (u in created) add(u)
                        }
                    })
                } catch (e: SQLException) {
                    if (e.sqlState == "23505") {
                        call.response.status(HttpStatusCode.Conflict)
                        call.respond(errorJson("conflict"))
                    } else {
                        call.response.status(HttpStatusCode.InternalServerError)
                        call.respond(errorJson("internal_error"))
                    }
                } catch (e: Exception) {
                    call.response.status(HttpStatusCode.BadRequest)
                    call.respond(errorJson("bad_request"))
                }
            }

            get("/users") {
                try {
                    val rawLimit = call.request.queryParameters["limit"]
                    val rawOffset = call.request.queryParameters["offset"]
                    val limit = if (rawLimit == null || rawLimit.isBlank()) 20 else rawLimit.toIntOrNull()
                    val offset = if (rawOffset == null || rawOffset.isBlank()) 0 else rawOffset.toIntOrNull()
                    if (limit == null || limit < 1 || limit > 100) {
                        call.response.status(HttpStatusCode.UnprocessableEntity)
                        return@get call.respond(validationJson(listOf("limit" to "invalid_type")))
                    }
                    if (offset == null || offset < 0) {
                        call.response.status(HttpStatusCode.UnprocessableEntity)
                        return@get call.respond(validationJson(listOf("offset" to "invalid_type")))
                    }

                    var total = 0L
                    val rows = mutableListOf<JsonObject>()
                    dataSource.connection.use { conn ->
                        conn.createStatement().use { st ->
                            st.executeQuery("SELECT COUNT(*) FROM users").use { rs ->
                                if (rs.next()) total = rs.getLong(1)
                            }
                        }
                        conn.prepareStatement(
                            "SELECT id, email, created_at FROM users ORDER BY id LIMIT ? OFFSET ?"
                        ).use { st ->
                            st.setInt(1, limit)
                            st.setInt(2, offset)
                            st.executeQuery().use { rs ->
                                while (rs.next()) {
                                    rows += userJson(rs.getLong("id"), rs.getString("email"), rs.getTimestamp("created_at"))
                                }
                            }
                        }
                    }

                    call.respond(buildJsonObject {
                        putJsonArray("data") {
                            for (row in rows) add(row)
                        }
                        putJsonObject("pagination") {
                            put("limit", limit)
                            put("offset", offset)
                            put("total", total)
                        }
                    })
                } catch (e: SQLException) {
                    call.response.status(HttpStatusCode.InternalServerError)
                    call.respond(errorJson("internal_error"))
                }
            }

            get("{...}") {
                call.response.status(HttpStatusCode.NotFound)
                call.respond(errorJson("endpoint_not_found"))
            }
        }

    }.start(wait = true)
}