package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.identity.AccountContacts
import org.detimarii.platform.identity.CurrentAccount
import org.detimarii.platform.onboarding.*
import org.detimarii.platform.volunteers.VolunteerProfiles
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
class StaffClearanceService(
    private val records: ClearanceRepository, private val roles: RoleRepository,
    private val profiles: VolunteerProfiles, private val account: CurrentAccount, private val contacts: AccountContacts,
) : ClearanceWorkflow {
    @Transactional(readOnly = true)
    override fun paperwork(volunteerId: UUID): DecisionHistory<PaperworkFields> {
        requireProfile(volunteerId)
        return paperworkView(volunteerId, records.paperwork(volunteerId))
    }

    @Transactional
    override fun savePaperwork(volunteerId: UUID, request: SavePaperworkRequest): DecisionHistory<PaperworkFields> {
        requireProfile(volunteerId)
        val fields = request.fields.normalized()
        records.lockPaperwork(volunteerId)
        val current = records.paperwork(volunteerId)
        if (current.fields == fields) return paperworkView(volunteerId, current)
        requireVersion(current.version, request.version)
        return paperworkView(volunteerId, records.appendPaperwork(volunteerId, current.version + 1, fields, account.id()))
    }

    @Transactional(readOnly = true)
    override fun admission(volunteerId: UUID, roleId: UUID): DecisionHistory<AdmissionFields> {
        requireProfile(volunteerId)
        requireRole(roleId)
        return admissionView(volunteerId, roleId, records.admission(volunteerId, roleId))
    }

    @Transactional
    override fun saveAdmission(volunteerId: UUID, roleId: UUID, request: SaveAdmissionRequest): DecisionHistory<AdmissionFields> {
        requireProfile(volunteerId)
        requireRole(roleId)
        val fields = request.fields.normalized()
        records.lockAdmission(volunteerId, roleId)
        val current = records.admission(volunteerId, roleId)
        if (current.fields == fields) return admissionView(volunteerId, roleId, current)
        requireVersion(current.version, request.version)
        return admissionView(volunteerId, roleId, records.appendAdmission(volunteerId, roleId, current.version + 1, fields, account.id()))
    }

    private fun requireProfile(id: UUID) {
        if (!profiles.exists(id)) throw ResponseStatusException(HttpStatus.NOT_FOUND, "Анкета не найдена.")
    }
    private fun requireRole(id: UUID) {
        if (roles.get(id) == null) throw ResponseStatusException(HttpStatus.NOT_FOUND, "Вид помощи не найден.")
    }
    private fun requireVersion(current: Long, expected: Long) {
        if (current != expected) throw ResponseStatusException(HttpStatus.CONFLICT, "Решение уже изменено. Загрузите актуальную версию перед сохранением.")
    }
    private fun paperworkView(id: UUID, current: DecisionSnapshot<PaperworkFields>) =
        withAuthors(current, records.paperworkHistory(id, current.version))
    private fun admissionView(id: UUID, roleId: UUID, current: DecisionSnapshot<AdmissionFields>) =
        withAuthors(current, records.admissionHistory(id, roleId, current.version))
    private fun <F> withAuthors(current: DecisionSnapshot<F>, history: List<DecisionSnapshot<F>>): DecisionHistory<F> {
        val authors = (history + current).mapNotNull { it.actorId }.distinct().associateWith(contacts::email)
        fun withAuthor(snapshot: DecisionSnapshot<F>) = snapshot.copy(actorEmail = authors[snapshot.actorId])
        return DecisionHistory(withAuthor(current), history.map(::withAuthor))
    }
}
