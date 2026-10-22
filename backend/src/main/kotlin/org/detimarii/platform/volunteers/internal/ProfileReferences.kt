package org.detimarii.platform.volunteers.internal

import org.detimarii.platform.identity.CurrentAccount
import org.detimarii.platform.volunteers.VolunteerProfiles
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class ProfileReferences(private val jdbc: JdbcTemplate, private val account: CurrentAccount) : VolunteerProfiles {
    @PreAuthorize("hasRole('VOLUNTEER')")
    override fun ownId(): UUID? = jdbc.query(
        "select id from volunteers.volunteer_profile where account_id = ?",
        { row, _ -> row.getObject("id", UUID::class.java) }, account.id(),
    ).singleOrNull()

    @PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
    override fun exists(id: UUID): Boolean = jdbc.queryForObject(
        "select exists(select 1 from volunteers.volunteer_profile where id = ?)", Boolean::class.java, id,
    )!!
}
