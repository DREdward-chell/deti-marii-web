package org.detimarii.platform.coordination.internal

import jakarta.validation.Valid
import org.detimarii.platform.onboarding.ReviewWorkflow
import org.detimarii.platform.onboarding.SaveReviewRequest
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import org.detimarii.platform.volunteers.Regularity
import org.detimarii.platform.volunteers.VolunteerDirectory
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/v1/coordination/volunteers")
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class VolunteerReviewController(private val volunteers: VolunteerDirectory, private val reviews: ReviewWorkflow) {
    @GetMapping
    fun list(
        @RequestParam(defaultValue = "") @Size(max = 120) q: String,
        @RequestParam(required = false) regularity: Regularity?,
        @RequestParam(defaultValue = "0") @Min(0) @Max(100_000) page: Int,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) size: Int,
    ) = volunteers.search(q, regularity, page, size)

    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID) = volunteers.get(id)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Анкета не найдена.")

    @GetMapping("/{id}/review")
    fun review(@PathVariable id: UUID) = reviews.get(id)

    @PutMapping("/{id}/review")
    fun saveReview(@PathVariable id: UUID, @Valid @RequestBody request: SaveReviewRequest) = reviews.save(id, request)
}
