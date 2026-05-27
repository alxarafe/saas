import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.plugins.contentnegotiation.*

fun main() {
    embeddedServer(Netty, host = "0.0.0.0", port = 3000) {

        install(ContentNegotiation) {
            json()
        }

        routing {
            get("/health") {
                call.respond(mapOf("status" to "ok"))
            }

            get("{...}") {
                call.response.status(HttpStatusCode.NotFound)
                call.respond(mapOf("error" to mapOf("code" to "endpoint_not_found")))
            }
        }

    }.start(wait = true)
}
