package org.detimarii.platform.onboarding

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

enum class PaperworkStatus { NOT_CONFIRMED, CONFIRMED, NEEDS_UPDATE }
enum class AdmissionStatus { NOT_GRANTED, GRANTED, SUSPENDED, REVOKED }

data class PaperworkFields(
    val status: PaperworkStatus,
    @field:NotBlank(message = "Добавьте пояснение для волонтёра.") @field:Size(max = 2000) val message: String,
    @field:Size(max = 4000) val internalNote: String = "",
) {
    fun normalized() = copy(message = message.trim(), internalNote = internalNote.trim())
}

data class AdmissionFields(
    val status: AdmissionStatus,
    @field:NotBlank(message = "Добавьте пояснение для волонтёра.") @field:Size(max = 2000) val message: String,
    @field:Size(max = 4000) val internalNote: String = "",
) {
    fun normalized() = copy(message = message.trim(), internalNote = internalNote.trim())
}

data class SavePaperworkRequest(@field:PositiveOrZero val version: Long, @field:Valid val fields: PaperworkFields)
data class SaveAdmissionRequest(@field:PositiveOrZero val version: Long, @field:Valid val fields: AdmissionFields)
data class DecisionSnapshot<F>(
    val fields: F, val version: Long, val updatedAt: Instant?, val actorId: UUID?, val actorEmail: String? = null,
)
data class DecisionHistory<F>(val current: DecisionSnapshot<F>, val history: List<DecisionSnapshot<F>>)

interface ClearanceWorkflow {
    fun paperwork(volunteerId: UUID): DecisionHistory<PaperworkFields>
    fun savePaperwork(volunteerId: UUID, @Valid request: SavePaperworkRequest): DecisionHistory<PaperworkFields>
    fun admission(volunteerId: UUID, roleId: UUID): DecisionHistory<AdmissionFields>
    fun saveAdmission(volunteerId: UUID, roleId: UUID, @Valid request: SaveAdmissionRequest): DecisionHistory<AdmissionFields>
}

/** These are current facts, not a global "volunteer status" or a grant of staff permissions. */
data class PaperworkSummary(val status: PaperworkStatus, val message: String, val updatedAt: Instant?)
data class AdmissionSummary(val role: VolunteerRole, val status: AdmissionStatus, val message: String, val updatedAt: Instant)
data class VolunteerClearance(val paperwork: PaperworkSummary, val admissions: List<AdmissionSummary>) {
    fun hasConfirmedPaperwork() = paperwork.status == PaperworkStatus.CONFIRMED
    fun hasAdmission(roleId: UUID) = admissions.any { it.role.id == roleId && it.status == AdmissionStatus.GRANTED }
}

/** Future learning/participation checks read current facts rather than caching permissions in the session. */
interface VolunteerClearanceReader {
    fun own(): VolunteerClearance
}
