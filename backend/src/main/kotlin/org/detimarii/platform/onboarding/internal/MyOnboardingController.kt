package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.onboarding.NextStepOwner
import org.detimarii.platform.onboarding.ReviewStatus
import org.detimarii.platform.onboarding.VolunteerClearanceReader
import org.detimarii.platform.volunteers.VolunteerProfiles
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.LocalDate

/** An explicit public projection: no internal note, staff identity, version or staff history. */
data class MyOnboardingView(
    val status: ReviewStatus, val message: String, val nextStep: String,
    val nextStepOwner: NextStepOwner?, val nextStepDate: LocalDate?, val updatedAt: Instant?,
)

@RestController
class MyOnboardingController(
    private val profiles: VolunteerProfiles, private val reviews: ReviewRepository, private val clearance: VolunteerClearanceReader,
) {
    @GetMapping("/api/v1/onboarding/me/clearance")
    @PreAuthorize("hasRole('VOLUNTEER')")
    fun clearance() = clearance.own()

    @GetMapping("/api/v1/onboarding/me")
    @PreAuthorize("hasRole('VOLUNTEER')")
    fun get(): MyOnboardingView {
        val id = profiles.ownId() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Анкета ещё не заполнена.")
        val current = reviews.current(id)
        val fields = current.fields
        return MyOnboardingView(fields.status, fields.message, fields.nextStep, fields.nextStepOwner, fields.nextStepDate, current.updatedAt)
    }
}
