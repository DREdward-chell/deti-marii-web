package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.onboarding.RoleFields
import org.detimarii.platform.onboarding.VolunteerRole
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class RoleRepository(private val jdbc: JdbcTemplate) {
    private val mapper = RowMapper { row, _ -> VolunteerRole(
        row.getObject("id", UUID::class.java), row.getString("name"), row.getString("description"), row.getLong("version"),
    ) }

    fun list(): List<VolunteerRole> = jdbc.query("select * from onboarding.volunteer_role order by lower(name), id", mapper)
    fun findAll(ids: Set<UUID>): List<VolunteerRole> {
        if (ids.isEmpty()) return emptyList()
        val placeholders = ids.joinToString(",") { "?" }
        return jdbc.query(
            "select * from onboarding.volunteer_role where id in ($placeholders) order by lower(name), id",
            mapper, *ids.toTypedArray(),
        )
    }
    fun get(id: UUID, lock: Boolean = false): VolunteerRole? = jdbc.query(
        "select * from onboarding.volunteer_role where id = ?" + if (lock) " for update" else "", mapper, id,
    ).singleOrNull()

    fun create(fields: RoleFields, actorId: UUID): VolunteerRole? {
        val created = jdbc.query(
            "insert into onboarding.volunteer_role (id, name, description) values (?, ?, ?) on conflict do nothing returning *",
            mapper, UUID.randomUUID(), fields.name, fields.description,
        ).singleOrNull() ?: return null
        record(created, actorId)
        return created
    }

    fun update(current: VolunteerRole, fields: RoleFields, actorId: UUID): VolunteerRole {
        val updated = jdbc.query(
            "update onboarding.volunteer_role set name = ?, description = ?, version = version + 1 where id = ? returning *",
            mapper, fields.name, fields.description, current.id,
        ).single()
        record(updated, actorId)
        return updated
    }

    private fun record(role: VolunteerRole, actorId: UUID) {
        jdbc.update(
            "insert into onboarding.volunteer_role_revision (role_id, version, name, description, actor_id) values (?, ?, ?, ?, ?)",
            role.id, role.version, role.name, role.description, actorId,
        )
    }
}
