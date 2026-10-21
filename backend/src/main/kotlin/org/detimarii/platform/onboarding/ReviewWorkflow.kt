package org.detimarii.platform.onboarding

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Review outcome only: it grants neither document clearance nor permission to a volunteer role. */
enum class ReviewStatus { NEW, IN_REVIEW, CONTINUE, PAUSED, DECLINED }
enum class NextStepOwner { VOLUNTEER, COORDINATOR }

data class ReviewFields(
    val status: ReviewStatus,
    @field:NotBlank(message = "Добавьте сообщение для волонтёра.")
    @field:Size(max = 2000)
    val message: String,
    @field:Size(max = 500) val nextStep: String = "",
    val nextStepOwner: NextStepOwner? = null,
    val nextStepDate: LocalDate? = null,
    @field:Size(max = 4000) val internalNote: String = "",
) {
    fun normalized() = copy(message = message.trim(), nextStep = nextStep.trim(), internalNote = internalNote.trim())
}

data class SaveReviewRequest(@field:PositiveOrZero val version: Long, @field:Valid val fields: ReviewFields)
data class ReviewSnapshot(
    val fields: ReviewFields, val version: Long, val updatedAt: Instant?, val actorId: UUID?,
    val actorEmail: String? = null,
)
data class StaffReview(val current: ReviewSnapshot, val history: List<ReviewSnapshot>)

interface ReviewWorkflow {
    fun get(volunteerId: UUID): StaffReview
    fun save(volunteerId: UUID, @Valid request: SaveReviewRequest): StaffReview
}
