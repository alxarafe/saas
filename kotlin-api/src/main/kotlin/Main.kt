import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.response.*
import io.ktor.server.request.*
import io.ktor.server.routing.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.plugins.contentnegotiation.*
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

fun main() {
    embeddedServer(Netty, host = "0.0.0.0", port = 3000) {

        install(ContentNegotiation) { json() }

        routing {
            get("/health") {
                call.respond(mapOf("status" to "ok"))
            }

            post("/auth/login") {
                try {
                    val body = call.receive<Map<String, String>>()
                    if (body["email"] != "admin@example.com" || body["password"] != "secret") {
                        call.response.status(HttpStatusCode.Unauthorized)
                        return@post call.respond(mapOf("error" to mapOf("code" to "invalid_credentials")))
                    }
                    val token = createToken("1", "admin@example.com", "secret")
                    call.respond(mapOf("data" to mapOf("token" to token)))
                } catch (e: Exception) {
                    call.response.status(HttpStatusCode.BadRequest)
                    call.respond(mapOf("error" to mapOf("code" to "invalid_request")))
                }
            }

            get("/me") {
                try {
                    val auth = call.request.headers["Authorization"] ?: ""
                    if (auth.isBlank() || !auth.startsWith("Bearer ")) {
                        call.response.status(HttpStatusCode.Unauthorized)
                        return@get call.respond(mapOf("error" to mapOf("code" to "missing_token")))
                    }
                    val token = auth.removePrefix("Bearer ").trim()
                    val payload = parseToken(token, "secret")
                    if (payload == null) {
                        call.response.status(HttpStatusCode.Unauthorized)
                        return@get call.respond(mapOf("error" to mapOf("code" to "invalid_token")))
                    }
                    val id = payload["sub"] ?: ""
                    val email = payload["email"] ?: ""
                    call.respondText(
                        contentType = ContentType.Application.Json,
                        text = """{"data":{"id":${id},"email":"${email}"}}"""
                    )
                } catch (e: Exception) {
                    call.response.status(HttpStatusCode.InternalServerError)
                    call.respond(mapOf("error" to mapOf("code" to "internal_error")))
                }
            }

            get("{...}") {
                call.response.status(HttpStatusCode.NotFound)
                call.respond(mapOf("error" to mapOf("code" to "endpoint_not_found")))
            }
        }

    }.start(wait = true)
}
