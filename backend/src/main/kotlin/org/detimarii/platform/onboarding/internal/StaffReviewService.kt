package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.identity.CurrentAccount
import org.detimarii.platform.identity.AccountContacts
import org.detimarii.platform.onboarding.ReviewSnapshot
import org.detimarii.platform.onboarding.ReviewWorkflow
import org.detimarii.platform.onboarding.SaveReviewRequest
import org.detimarii.platform.onboarding.StaffReview
import org.detimarii.platform.volunteers.VolunteerProfiles
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.context.ApplicationEventPublisher
import org.detimarii.platform.onboarding.VolunteerUpdate
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
@Validated
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class StaffReviewService(
    private val reviews: ReviewRepository, private val profiles: VolunteerProfiles, private val account: CurrentAccount,
    private val contacts: AccountContacts,
    private val events: ApplicationEventPublisher,
) : ReviewWorkflow {
    @Transactional(readOnly = true)
    override fun get(volunteerId: UUID): StaffReview {
        requireProfile(volunteerId)
        return view(volunteerId, reviews.current(volunteerId))
    }

    @Transactional
    override fun save(volunteerId: UUID, request: SaveReviewRequest): StaffReview {
        requireProfile(volunteerId)
        val fields = request.fields.normalized()
        if ((fields.nextStep.isEmpty() && (fields.nextStepOwner != null || fields.nextStepDate != null)) ||
            (fields.nextStep.isNotEmpty() && fields.nextStepOwner == null)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Укажите следующий шаг и ответственного вместе; дату можно оставить пустой.")
        }
        if (fields.nextStepDate?.year?.let { it !in 1..9999 } == true) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Укажите корректную дату следующего шага.")
        }
        reviews.lock(volunteerId)
        val current = reviews.current(volunteerId)
        if (current.fields == fields) return view(volunteerId, current)
        if (current.version != request.version) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Рассмотрение уже изменено. Загрузите актуальную версию перед сохранением.")
        }
        if (current.fields.copy(internalNote = fields.internalNote) != fields) {
            events.publishEvent(VolunteerUpdate(volunteerId, "review:$volunteerId:${current.version + 1}",
                "Координатор обновил следующий шаг по вашей анкете. Подробности — в личном кабинете."))
        }
        return view(volunteerId, reviews.append(volunteerId, current.version + 1, fields, account.id()))
    }

    private fun requireProfile(id: UUID) {
        if (!profiles.exists(id)) throw ResponseStatusException(HttpStatus.NOT_FOUND, "Анкета не найдена.")
    }

    private fun view(id: UUID, current: ReviewSnapshot): StaffReview {
        val history = reviews.history(id, current.version)
        val authors = (history + current).mapNotNull { it.actorId }.distinct().associateWith(contacts::email)
        fun withAuthor(snapshot: ReviewSnapshot) = snapshot.copy(actorEmail = authors[snapshot.actorId])
        return StaffReview(withAuthor(current), history.map(::withAuthor))
    }
}
