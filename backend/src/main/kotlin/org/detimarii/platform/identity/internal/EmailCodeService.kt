package org.detimarii.platform.identity.internal

import jakarta.servlet.http.HttpSession
import org.detimarii.platform.identity.LoginCodeSender
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class EmailVerification(val expiresAt: Instant, val resendAfterSeconds: Long, val verificationRequired: Boolean = true)

@Service
class EmailCodeService(
    private val accounts: AccountRepository,
    private val sender: LoginCodeSender,
    private val clock: Clock,
) {
    private val random = SecureRandom()
    private val key = ByteArray(32).also(random::nextBytes)
    private val attribute = EmailCodeService::class.java.name

    // Deliberately not a data class: toString must not disclose authentication material.
    private class Pending(
        val state: AccountSecurity, val nonce: UUID, val digest: ByteArray,
        val sentAt: Instant, val expiresAt: Instant, var attempts: Int = 0,
    )

    fun clear(session: HttpSession) = synchronized(session) { session.removeAttribute(attribute) }

    fun begin(authentication: Authentication, session: HttpSession): EmailVerification = synchronized(session) {
        val user = authentication.principal as SessionUser
        val state = accounts.security(UUID.fromString(user.username)) ?: invalid()
        if (state.version != user.securityVersion ||
            state.account.roles.map { "ROLE_${it.name}" }.toSet() !=
            authentication.authorities.mapNotNull { it.authority }.filter { it.startsWith("ROLE_") }.toSet()) invalid()
        deliver(state, session)
    }

    fun resend(session: HttpSession): EmailVerification = synchronized(session) {
        val pending = pending(session)
        current(pending)
        deliver(pending.state, session)
    }

    fun view(session: HttpSession?): EmailVerification? {
        if (session == null) return null
        return synchronized(session) {
            val pending = session.getAttribute(attribute) as? Pending ?: return@synchronized null
            if (!pending.expiresAt.isAfter(clock.instant())) {
                session.removeAttribute(attribute)
                return@synchronized null
            }
            view(pending)
        }
    }

    fun verify(session: HttpSession, code: String): Authentication = synchronized(session) {
        val pending = pending(session)
        pending.attempts++
        if (!MessageDigest.isEqual(pending.digest, digest(pending.nonce, code))) {
            if (pending.attempts >= 5) session.removeAttribute(attribute)
            invalid()
        }
        // Consume before establishing authentication; concurrent verification can succeed only once.
        session.removeAttribute(attribute)
        val state = current(pending)
        val user = SessionUser(state.account.id, "", state.account.roles, state.version)
        UsernamePasswordAuthenticationToken.authenticated(
            user, null, user.authorities + SimpleGrantedAuthority("STAFF_VERIFIED"),
        )
    }

    private fun deliver(state: AccountSecurity, session: HttpSession): EmailVerification {
        val now = clock.instant()
        if (!accounts.claimCodeDelivery(state.account.id, now)) throw AuthRateLimitExceeded(60)
        val previous = session.getAttribute(attribute) as? Pending
        session.removeAttribute(attribute)
        var code: String
        do {
            code = random.nextInt(1_000_000).toString().padStart(6, '0')
        } while (previous != null && MessageDigest.isEqual(previous.digest, digest(previous.nonce, code)))
        val nonce = UUID.randomUUID()
        val pending = Pending(state, nonce, digest(nonce, code), now, now.plusSeconds(300))
        sender.send(state.account.email, code)
        // A failed SMTP operation never creates a usable challenge or an authenticated session.
        session.setAttribute(attribute, pending)
        return view(pending)
    }

    private fun pending(session: HttpSession): Pending {
        val pending = session.getAttribute(attribute) as? Pending ?: invalid()
        if (!pending.expiresAt.isAfter(clock.instant()) || pending.attempts >= 5) {
            session.removeAttribute(attribute)
            invalid()
        }
        return pending
    }

    private fun current(pending: Pending): AccountSecurity {
        val current = accounts.security(pending.state.account.id) ?: invalid()
        if (current != pending.state) invalid()
        return current
    }

    private fun view(pending: Pending) = EmailVerification(
        pending.expiresAt, (pending.sentAt.plusSeconds(60).epochSecond - clock.instant().epochSecond).coerceAtLeast(0),
    )

    private fun digest(nonce: UUID, code: String): ByteArray = Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(key, "HmacSHA256"))
        doFinal("$nonce:$code".toByteArray(Charsets.UTF_8))
    }

    private fun invalid(): Nothing = throw ResponseStatusException(
        HttpStatus.UNAUTHORIZED, "Код неверен или больше не действует. После пяти ошибок начните вход заново.",
    )
}
