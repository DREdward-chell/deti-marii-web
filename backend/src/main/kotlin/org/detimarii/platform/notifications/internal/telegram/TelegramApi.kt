package org.detimarii.platform.notifications.internal.telegram

import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/** Sanitized failure: never include request URI, bot token, response body or message text. */
class TelegramFailure(val code: Int, val retryAfter: Long = 0) : RuntimeException("Telegram request failed ($code)")

interface TelegramApi {
    fun call(method: String, body: Map<String, Any>): JsonNode
}

@Component
class HttpTelegramApi(private val properties: TelegramProperties, private val json: ObjectMapper) : TelegramApi {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    override fun call(method: String, body: Map<String, Any>): JsonNode {
        check(properties.enabled)
        try {
            val request = HttpRequest.newBuilder(URI("https://api.telegram.org/bot${properties.token}/$method"))
                .timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build()
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            val result = json.readTree(response.body())
            if (!result.path("ok").asBoolean(false)) {
                throw TelegramFailure(result.path("error_code").asInt(response.statusCode()),
                    result.path("parameters").path("retry_after").asLong(0))
            }
            return result.path("result")
        } catch (failure: TelegramFailure) {
            throw failure
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            throw TelegramFailure(503)
        } catch (_: Exception) {
            throw TelegramFailure(503)
        }
    }
}
