package org.detimarii.platform.identity

import java.util.UUID

/** Identifies the authenticated caller; account ownership is never read from a request body. */
interface CurrentAccount {
    fun id(): UUID
}
