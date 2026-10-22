package org.detimarii.platform.identity

import java.util.UUID

interface AccountContacts {
    fun email(accountId: UUID): String?
}
