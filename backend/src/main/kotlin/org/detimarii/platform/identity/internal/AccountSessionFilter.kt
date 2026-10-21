package org.detimarii.platform.identity.internal

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.User
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

class SessionUser(
    id: UUID,
    password: String,
    roles: Set<AccountRole>,
    val securityVersion: Long,
) : User(id.toString(), password, roles.map { SimpleGrantedAuthority("ROLE_${it.name}") })

data class AccountSecurity(val account: AccountView, val version: Long)

fun Set<AccountRole>.requiresEmailCode() = any { it == AccountRole.COORDINATOR || it == AccountRole.ADMIN }

/** Rechecks live account state on each request, including sessions created before a role change. */
class AccountSessionFilter(private val accounts: AccountRepository) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val authentication = SecurityContextHolder.getContext().authentication
        if (authentication != null && authentication !is AnonymousAuthenticationToken) {
            val principal = authentication.principal as? SessionUser
            val state = principal?.let { accounts.security(UUID.fromString(it.username)) }
            val authorities = authentication.authorities.mapNotNull { it.authority }.toSet()
            val roles = authorities.filter { it.startsWith("ROLE_") }.toSet()
            val valid = state != null && state.version == principal.securityVersion &&
                state.account.roles.map { "ROLE_${it.name}" }.toSet() == roles &&
                (!state.account.roles.requiresEmailCode() || "STAFF_VERIFIED" in authorities)
            if (!valid) {
                SecurityContextHolder.clearContext()
                request.getSession(false)?.invalidate()
                response.status = 401
                response.contentType = "application/problem+json"
                response.writer.write("""{"status":401,"detail":"Доступ изменился. Войдите в аккаунт ещё раз."}""")
                return
            }
        }
        chain.doFilter(request, response)
    }
}
