package org.detimarii.platform.volunteers.internal

import org.detimarii.platform.identity.AccountContacts
import org.detimarii.platform.volunteers.Regularity
import org.detimarii.platform.volunteers.VolunteerCard
import org.detimarii.platform.volunteers.VolunteerDirectory
import org.detimarii.platform.volunteers.VolunteerPage
import org.detimarii.platform.volunteers.VolunteerSummary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional(readOnly = true)
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class StaffVolunteerDirectory(private val jdbc: JdbcTemplate, private val contacts: AccountContacts) : VolunteerDirectory {
    override fun search(query: String, regularity: Regularity?, page: Int, size: Int): VolunteerPage {
        require(page in 0..100_000 && size in 1..100 && query.length <= 120)
        val where = "where position(lower(?) in lower(display_name)) > 0" +
            if (regularity == null) "" else " and regularity = ?"
        val args = mutableListOf<Any>(query.trim()).apply { if (regularity != null) add(regularity.name) }
        val total = jdbc.queryForObject("select count(*) from volunteers.volunteer_profile $where", Long::class.java, *args.toTypedArray())!!
        val items = jdbc.query(
            "select id, display_name, regularity, availability, created_at from volunteers.volunteer_profile $where order by created_at desc, id limit ? offset ?",
            { row, _ -> VolunteerSummary(
                row.getObject("id", UUID::class.java), row.getString("display_name"),
                Regularity.valueOf(row.getString("regularity")), row.getString("availability"), row.getTimestamp("created_at").toInstant(),
            ) }, *(args + size + page.toLong() * size).toTypedArray(),
        )
        return VolunteerPage(items, total, page, size)
    }

    override fun get(id: UUID): VolunteerCard? = jdbc.query(
        "select * from volunteers.volunteer_profile where id = ?",
        { row, _ ->
            row.getObject("account_id", UUID::class.java) to VolunteerCard(
                row.getObject("id", UUID::class.java), row.getString("display_name"), null, row.getString("phone"),
                row.getString("interests"), row.getString("skills"), row.getString("availability"),
                Regularity.valueOf(row.getString("regularity")), row.getTimestamp("created_at").toInstant(),
                row.getTimestamp("updated_at").toInstant(),
            )
        }, id,
    ).singleOrNull()?.let { (accountId, card) -> card.copy(email = contacts.email(accountId)) }
}
