package org.detimarii.platform.identity.internal

import org.detimarii.platform.identity.CurrentAccount
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class SpringCurrentAccount : CurrentAccount {
    override fun id(): UUID {
        val authentication = SecurityContextHolder.getContext().authentication
        if (authentication == null || !authentication.isAuthenticated || authentication is AnonymousAuthenticationToken) {
            throw AuthenticationCredentialsNotFoundException("Authentication required")
        }
        return UUID.fromString(authentication.name)
    }
}
