package org.detimarii.platform.volunteers.internal

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.util.UUID
import org.detimarii.platform.volunteers.Regularity

@Repository
class ProfileRepository(private val jdbc: JdbcTemplate) {
    private val rowMapper = RowMapper { row, _ ->
        ProfileView(
            row.getObject("id", UUID::class.java),
            row.getString("display_name"), row.getString("phone"), row.getString("interests"),
            row.getString("skills"), row.getString("availability"),
            Regularity.valueOf(row.getString("regularity")), row.getLong("version"),
            row.getTimestamp("updated_at").toInstant(),
        )
    }

    fun findForAccount(accountId: UUID): ProfileView? = jdbc.query(
        "select * from volunteers.volunteer_profile where account_id = ?", rowMapper, accountId,
    ).singleOrNull()

    fun create(accountId: UUID, fields: ProfileFields): ProfileView? = jdbc.query(
        """
        insert into volunteers.volunteer_profile
            (id, account_id, display_name, phone, interests, skills, availability, regularity)
        values (?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (account_id) do nothing
        returning *
        """.trimIndent(),
        rowMapper, UUID.randomUUID(), accountId, fields.displayName, fields.phone, fields.interests,
        fields.skills, fields.availability, fields.regularity.name,
    ).singleOrNull()

    fun update(accountId: UUID, expectedVersion: Long, fields: ProfileFields): ProfileView? = jdbc.query(
        """
        update volunteers.volunteer_profile
        set display_name = ?, phone = ?, interests = ?, skills = ?, availability = ?, regularity = ?,
            version = version + 1, updated_at = now()
        where account_id = ? and version = ?
        returning *
        """.trimIndent(),
        rowMapper, fields.displayName, fields.phone, fields.interests, fields.skills, fields.availability,
        fields.regularity.name, accountId, expectedVersion,
    ).singleOrNull()
}
