package org.detimarii.platform.onboarding

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import java.util.UUID

/** A kind of volunteer help, never an identity/security role. */
data class VolunteerRole(val id: UUID, val name: String, val description: String, val version: Long)
data class RoleFields(
    @field:NotBlank(message = "Укажите название вида помощи.") @field:Size(max = 100) val name: String,
    @field:Size(max = 1000) val description: String = "",
) {
    fun normalized() = copy(name = name.trim().replace(Regex("\\s+"), " "), description = description.trim())
}
data class SaveRoleRequest(@field:PositiveOrZero val version: Long, @field:Valid val fields: RoleFields)

interface VolunteerRoleCatalog {
    fun list(): List<VolunteerRole>
    fun create(@Valid fields: RoleFields): VolunteerRole
    fun update(id: UUID, @Valid request: SaveRoleRequest): VolunteerRole
}
