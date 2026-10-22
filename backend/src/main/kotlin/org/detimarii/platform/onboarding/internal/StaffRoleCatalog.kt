package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.identity.CurrentAccount
import org.detimarii.platform.onboarding.RoleFields
import org.detimarii.platform.onboarding.SaveRoleRequest
import org.detimarii.platform.onboarding.VolunteerRole
import org.detimarii.platform.onboarding.VolunteerRoleCatalog
import org.springframework.dao.DuplicateKeyException
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
class StaffRoleCatalog(private val roles: RoleRepository, private val account: CurrentAccount) : VolunteerRoleCatalog {
    @Transactional(readOnly = true)
    override fun list() = roles.list()

    @Transactional
    override fun create(fields: RoleFields): VolunteerRole = roles.create(fields.normalized(), account.id()) ?: throw duplicate()

    @Transactional
    override fun update(id: UUID, request: SaveRoleRequest): VolunteerRole {
        val current = roles.get(id, lock = true) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Вид помощи не найден.")
        val fields = request.fields.normalized()
        if (current.name == fields.name && current.description == fields.description) return current
        if (current.version != request.version) throw ResponseStatusException(HttpStatus.CONFLICT, "Вид помощи уже изменён. Загрузите актуальную версию.")
        try {
            return roles.update(current, fields, account.id())
        } catch (_: DuplicateKeyException) {
            throw duplicate()
        }
    }

    private fun duplicate() = ResponseStatusException(HttpStatus.CONFLICT, "Вид помощи с таким названием уже существует.")
}
