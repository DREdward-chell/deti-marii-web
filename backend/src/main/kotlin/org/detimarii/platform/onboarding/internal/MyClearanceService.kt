package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.onboarding.PaperworkSummary
import org.detimarii.platform.onboarding.VolunteerClearance
import org.detimarii.platform.onboarding.VolunteerClearanceReader
import org.detimarii.platform.volunteers.VolunteerProfiles
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class MyClearanceService(private val profiles: VolunteerProfiles, private val records: ClearanceRepository) : VolunteerClearanceReader {
    @PreAuthorize("hasRole('VOLUNTEER')")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    override fun own(): VolunteerClearance {
        val id = profiles.ownId() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Анкета ещё не заполнена.")
        val paperwork = records.paperwork(id)
        return VolunteerClearance(
            PaperworkSummary(paperwork.fields.status, paperwork.fields.message, paperwork.updatedAt), records.ownAdmissions(id),
        )
    }
}
