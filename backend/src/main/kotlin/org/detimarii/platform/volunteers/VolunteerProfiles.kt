package org.detimarii.platform.volunteers

import java.util.UUID

/** Minimal profile references; other modules never query the volunteers schema. */
interface VolunteerProfiles {
    fun ownId(): UUID?
    fun exists(id: UUID): Boolean
}
