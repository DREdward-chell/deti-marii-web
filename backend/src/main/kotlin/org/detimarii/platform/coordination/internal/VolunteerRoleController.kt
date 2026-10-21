package org.detimarii.platform.coordination.internal

import jakarta.validation.Valid
import org.detimarii.platform.onboarding.RoleFields
import org.detimarii.platform.onboarding.SaveRoleRequest
import org.detimarii.platform.onboarding.VolunteerRoleCatalog
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/v1/coordination/volunteer-roles")
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class VolunteerRoleController(private val catalog: VolunteerRoleCatalog) {
    @GetMapping fun list() = catalog.list()
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody fields: RoleFields) = catalog.create(fields)
    @PutMapping("/{id}")
    fun update(@PathVariable id: UUID, @Valid @RequestBody request: SaveRoleRequest) = catalog.update(id, request)
}
