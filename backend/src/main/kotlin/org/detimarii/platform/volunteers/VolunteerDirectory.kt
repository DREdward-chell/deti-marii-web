package org.detimarii.platform.volunteers

import java.time.Instant
import java.util.UUID

enum class Regularity { UNSURE, ONE_OFF, REGULAR }

data class VolunteerSummary(
    val id: UUID, val displayName: String, val regularity: Regularity,
    val availability: String, val createdAt: Instant,
)

data class VolunteerPage(val items: List<VolunteerSummary>, val total: Long, val page: Int, val size: Int)

data class VolunteerCard(
    val id: UUID, val displayName: String, val email: String?, val phone: String,
    val interests: String, val skills: String, val availability: String, val regularity: Regularity,
    val createdAt: Instant, val updatedAt: Instant,
)

interface VolunteerDirectory {
    fun search(query: String, regularity: Regularity?, page: Int, size: Int): VolunteerPage
    fun get(id: UUID): VolunteerCard?
}
