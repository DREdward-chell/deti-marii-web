package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.onboarding.NextStepOwner
import org.detimarii.platform.onboarding.ReviewFields
import org.detimarii.platform.onboarding.ReviewSnapshot
import org.detimarii.platform.onboarding.ReviewStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.time.LocalDate
import java.util.UUID

@Repository
class ReviewRepository(private val jdbc: JdbcTemplate) {
    private val mapper = RowMapper { row, _ ->
        ReviewSnapshot(
            ReviewFields(
                ReviewStatus.valueOf(row.getString("status")), row.getString("message"), row.getString("next_step"),
                row.getString("next_step_owner")?.let(NextStepOwner::valueOf),
                row.getObject("next_step_date", LocalDate::class.java), row.getString("internal_note"),
            ), row.getLong("version"), row.getTimestamp("updated_at").toInstant(), row.getObject("actor_id", UUID::class.java),
        )
    }

    fun current(id: UUID): ReviewSnapshot = jdbc.query(
        """select revision.* from onboarding.review r join onboarding.review_revision revision
           on revision.volunteer_id = r.volunteer_id and revision.version = r.version where r.volunteer_id = ?""",
        mapper, id,
    ).singleOrNull() ?: ReviewSnapshot(ReviewFields(ReviewStatus.NEW, ""), 0, null, null)

    fun history(id: UUID, version: Long): List<ReviewSnapshot> = jdbc.query(
        "select * from onboarding.review_revision where volunteer_id = ? and version <= ? order by version desc limit 50",
        mapper, id, version,
    )

    /** Serializes both the first write and updates; the caller holds one transaction through the audit insert. */
    fun lock(id: UUID) {
        jdbc.update("insert into onboarding.review (volunteer_id) values (?) on conflict do nothing", id)
        jdbc.queryForObject("select version from onboarding.review where volunteer_id = ? for update", Long::class.java, id)
    }

    fun append(id: UUID, version: Long, fields: ReviewFields, actorId: UUID): ReviewSnapshot {
        val saved = jdbc.query(
            """insert into onboarding.review_revision
               (volunteer_id, version, status, message, next_step, next_step_owner, next_step_date, internal_note, actor_id)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?) returning *""",
            mapper, id, version, fields.status.name, fields.message, fields.nextStep, fields.nextStepOwner?.name,
            fields.nextStepDate, fields.internalNote, actorId,
        ).single()
        jdbc.update("update onboarding.review set version = ? where volunteer_id = ?", version, id)
        return saved
    }
}
