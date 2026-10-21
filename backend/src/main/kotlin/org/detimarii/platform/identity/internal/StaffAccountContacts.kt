package org.detimarii.platform.identity.internal

import org.detimarii.platform.identity.AccountContacts
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import java.util.UUID

@Service
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class StaffAccountContacts(private val accounts: AccountRepository) : AccountContacts {
    override fun email(accountId: UUID): String? = accounts.find(accountId)?.email
}
