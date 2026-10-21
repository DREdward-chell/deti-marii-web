package org.detimarii.platform.identity.internal

import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class AuthRateLimiterTests {
    @Test
    fun `exhausted address is blocked without blocking another address and recovers after the window`() {
        val clock = MutableClock()
        val limiter = AuthRateLimiter(clock, 2)
        limiter.check("192.0.2.1")
        limiter.check("192.0.2.1")
        assertThatThrownBy { limiter.check("192.0.2.1") }.isInstanceOf(AuthRateLimitExceeded::class.java)
        limiter.check("192.0.2.2")
        clock.now = clock.now.plusSeconds(60)
        limiter.check("192.0.2.1")
    }

    private class MutableClock : Clock() {
        var now: Instant = Instant.parse("2026-10-21T12:00:00Z")
        override fun instant(): Instant = now
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = fixed(now, zone)
    }
}
