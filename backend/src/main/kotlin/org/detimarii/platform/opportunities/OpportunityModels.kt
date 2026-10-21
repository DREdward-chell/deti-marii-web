package org.detimarii.platform.opportunities

import jakarta.validation.Valid
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import org.detimarii.platform.onboarding.AdmissionStatus
import org.detimarii.platform.onboarding.VolunteerRole
import java.time.Instant
import java.util.UUID

enum class OpportunityRegularity { ONE_OFF, REGULAR, FLEXIBLE }
data class OpportunityContent(
    @field:Size(max = 150) val title: String = "Новая возможность",
    @field:Size(max = 500) val summary: String = "",
    @field:Size(max = 6000) val description: String = "",
    val roleId: UUID? = null,
    val regularity: OpportunityRegularity = OpportunityRegularity.FLEXIBLE,
    @field:Size(max = 500) val location: String = "",
    @field:Size(max = 500) val schedule: String = "",
    @field:Size(max = 2000) val requirements: String = "",
    @field:Size(max = 2000) val training: String = "",
    val demo: Boolean = false,
) {
    fun normalized() = copy(title = title.trim(), summary = summary.trim(), description = description.trim(),
        location = location.trim(), schedule = schedule.trim(), requirements = requirements.trim(), training = training.trim())
}
data class OpportunityDraft(val id: UUID, val revision: Long, val content: OpportunityContent, val publishedVersion: Int?, val publishedRevision: Long?)
data class OpportunityListItem(val id: UUID, val title: String, val revision: Long, val publishedVersion: Int?, val publishedRevision: Long?)
data class SaveOpportunityRequest(@field:PositiveOrZero val revision: Long, @field:Valid val content: OpportunityContent)
data class PublishOpportunityRequest(@field:PositiveOrZero val revision: Long)
data class WithdrawOpportunityRequest(@field:Positive val publishedVersion: Int)
data class OpportunityCard(val id: UUID, val title: String, val summary: String, val regularity: OpportunityRegularity,
    val location: String, val schedule: String, val role: VolunteerRole, val demo: Boolean, val version: Int, val admissionStatus: AdmissionStatus)
data class OpportunityDetail(val id: UUID, val title: String, val summary: String, val regularity: OpportunityRegularity,
    val location: String, val schedule: String, val role: VolunteerRole, val demo: Boolean, val version: Int, val admissionStatus: AdmissionStatus,
    val description: String, val requirements: String, val training: String, val publishedAt: Instant)
data class OpportunityPage(val items: List<OpportunityCard>, val total: Long, val page: Int, val size: Int)
data class OpportunityFilters(val roles: List<VolunteerRole>)
interface OpportunityManagement {
    fun list(): List<OpportunityListItem>
    fun create(): OpportunityDraft
    fun get(id: UUID): OpportunityDraft
    fun save(id: UUID, @Valid request: SaveOpportunityRequest): OpportunityDraft
    fun publish(id: UUID, @Valid request: PublishOpportunityRequest): OpportunityDraft
    fun withdraw(id: UUID, @Valid request: WithdrawOpportunityRequest): OpportunityDraft
}
