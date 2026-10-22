package org.detimarii.platform.notifications

import java.util.UUID

/** Call in the same transaction as the domain change. Keys must identify one event/version.
 * Only queues for currently linked accounts; never grants access or sends historical events.
 */
interface VolunteerNotifications {
    fun enqueue(accountId: UUID, eventKey: String, message: String)
}
