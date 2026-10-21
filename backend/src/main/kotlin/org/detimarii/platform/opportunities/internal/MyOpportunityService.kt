package org.detimarii.platform.opportunities.internal

import org.detimarii.platform.onboarding.AdmissionStatus
import org.detimarii.platform.onboarding.VolunteerClearance
import org.detimarii.platform.onboarding.VolunteerClearanceReader
import org.detimarii.platform.onboarding.VolunteerRole
import org.detimarii.platform.onboarding.VolunteerRoleReader
import org.detimarii.platform.opportunities.*
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
@PreAuthorize("hasRole('VOLUNTEER')")
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
class MyOpportunityService(private val records: OpportunityRepository, private val clearance: VolunteerClearanceReader, private val roles: VolunteerRoleReader) {
    fun list(q: String, regularity: OpportunityRegularity?, roleId: UUID?, page: Int, size: Int): OpportunityPage {
        val own = requireClearance()
        val (publications, total) = records.search(q.trim(), regularity?.name, roleId, page, size)
        val roleMap = roles.findAll(publications.map { it.content.roleId!! }.toSet()).associateBy { it.id }
        return OpportunityPage(publications.map { card(it, roleMap.getValue(it.content.roleId!!), own) }, total, page, size)
    }
    fun filters(): OpportunityFilters {
        requireClearance()
        return OpportunityFilters(roles.findAll(records.roleIds()).sortedWith(compareBy<VolunteerRole> { it.name }.thenBy { it.id }))
    }
    fun get(id: UUID): OpportunityDetail {
        val own = requireClearance()
        val publication = records.publication(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Возможность не найдена.")
        val content = publication.content
        val role = checkNotNull(roles.find(content.roleId!!))
        val card = card(publication, role, own)
        return OpportunityDetail(card.id, card.title, card.summary, card.regularity, card.location, card.schedule, role,
            card.demo, card.version, card.admissionStatus, content.description, content.requirements, content.training, publication.publishedAt)
    }
    private fun requireClearance(): VolunteerClearance {
        val own = clearance.own()
        if (!own.hasConfirmedPaperwork()) throw ResponseStatusException(HttpStatus.FORBIDDEN, "Для просмотра возможностей нужно подтверждённое оформление.")
        return own
    }
    private fun card(publication: PublishedOpportunity, role: VolunteerRole, own: VolunteerClearance): OpportunityCard {
        val content = publication.content
        val admission = own.admissions.firstOrNull { it.role.id == role.id }?.status ?: AdmissionStatus.NOT_GRANTED
        return OpportunityCard(publication.id, content.title, content.summary, content.regularity, content.location, content.schedule,
            role, content.demo, publication.version, admission)
    }
}
