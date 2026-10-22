package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.onboarding.VolunteerRoleReader
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional(readOnly = true)
@PreAuthorize("hasRole('VOLUNTEER') or (hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED'))")
class VolunteerRoleLookup(private val roles: RoleRepository) : VolunteerRoleReader {
    override fun find(id: UUID) = roles.get(id)
    override fun findAll(ids: Set<UUID>) = roles.findAll(ids)
}
