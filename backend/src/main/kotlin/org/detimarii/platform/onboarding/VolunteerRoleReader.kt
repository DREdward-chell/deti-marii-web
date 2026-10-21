package org.detimarii.platform.onboarding

import java.util.UUID

/** Role metadata for other modules; callers enforce access to their own resources. */
interface VolunteerRoleReader {
    fun find(id: UUID): VolunteerRole?
    fun findAll(ids: Set<UUID>): List<VolunteerRole>
}
