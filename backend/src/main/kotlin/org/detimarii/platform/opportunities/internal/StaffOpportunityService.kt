package org.detimarii.platform.opportunities.internal

import org.detimarii.platform.identity.CurrentAccount
import org.detimarii.platform.onboarding.VolunteerRoleReader
import org.detimarii.platform.opportunities.*
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
@Validated
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class StaffOpportunityService(private val records: OpportunityRepository, private val account: CurrentAccount, private val roles: VolunteerRoleReader) : OpportunityManagement {
    @Transactional(readOnly = true)
    override fun list() = records.drafts().map { OpportunityListItem(it.id, it.content.title, it.revision, it.publishedVersion, it.publishedRevision) }
    @Transactional override fun create() = records.create(account.id())
    @Transactional(readOnly = true) override fun get(id: UUID) = draft(id)
    @Transactional
    override fun save(id: UUID, request: SaveOpportunityRequest): OpportunityDraft {
        val current = draft(id, true)
        val content = request.content.normalized()
        validateRole(content)
        if (current.content == content) return current
        requireRevision(current, request.revision)
        return records.save(id, content, account.id())
    }
    @Transactional
    override fun publish(id: UUID, request: PublishOpportunityRequest): OpportunityDraft {
        val current = draft(id, true)
        requireRevision(current, request.revision)
        val content = current.content
        if (listOf(content.title, content.summary, content.description, content.location, content.schedule).any { it.isBlank() } || content.roleId == null)
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Для публикации заполните название, краткое и полное описание, вид помощи, место и расписание.")
        validateRole(content)
        if (current.publishedRevision == current.revision) return current
        return records.publish(current, account.id())
    }
    @Transactional
    override fun withdraw(id: UUID, request: WithdrawOpportunityRequest): OpportunityDraft {
        val current = draft(id, true)
        if (current.publishedVersion == null) return current
        if (current.publishedVersion != request.publishedVersion) throw ResponseStatusException(HttpStatus.CONFLICT, "Опубликована другая версия. Обновите возможность.")
        return records.withdraw(current, account.id())
    }
    private fun validateRole(content: OpportunityContent) {
        if (content.roleId != null && roles.find(content.roleId) == null) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Выберите существующий вид помощи.")
    }
    private fun draft(id: UUID, lock: Boolean = false) = records.draft(id, lock) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Возможность не найдена.")
    private fun requireRevision(draft: OpportunityDraft, revision: Long) {
        if (draft.revision != revision) throw ResponseStatusException(HttpStatus.CONFLICT, "Черновик уже изменён. Загрузите актуальную версию.")
    }
}
