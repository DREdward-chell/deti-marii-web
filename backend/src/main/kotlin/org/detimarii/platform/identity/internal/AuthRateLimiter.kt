package org.detimarii.platform.identity.internal

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant

class AuthRateLimitExceeded(val retryAfterSeconds: Long) : RuntimeException()

/** Bounded, per-address limiter for the current single-instance deployment. */
@Component
class AuthRateLimiter(
    private val clock: Clock,
    @Value("\${platform.auth.requests-per-minute:30}") private val limit: Int,
) {
    private data class Window(val expiresAt: Instant, var count: Int = 0)
    private val windows = mutableMapOf<String, Window>()

    @Synchronized
    fun check(address: String) {
        val now = clock.instant()
        windows.entries.removeIf { !it.value.expiresAt.isAfter(now) }
        if (address !in windows && windows.size >= 10_000) throw AuthRateLimitExceeded(60)
        val window = windows.getOrPut(address) { Window(now.plusSeconds(60)) }
        if (window.count >= limit) {
            throw AuthRateLimitExceeded((window.expiresAt.epochSecond - now.epochSecond).coerceAtLeast(1))
        }
        window.count++
    }
}
