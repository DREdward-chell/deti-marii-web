package org.detimarii.platform.onboarding.internal

import org.detimarii.platform.onboarding.AdmissionFields
import org.detimarii.platform.onboarding.AdmissionStatus
import org.detimarii.platform.onboarding.AdmissionSummary
import org.detimarii.platform.onboarding.DecisionSnapshot
import org.detimarii.platform.onboarding.PaperworkFields
import org.detimarii.platform.onboarding.PaperworkStatus
import org.detimarii.platform.onboarding.VolunteerRole
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class ClearanceRepository(private val jdbc: JdbcTemplate) {
    private val paperworkMapper = RowMapper { row, _ -> snapshot(row, PaperworkFields(
        PaperworkStatus.valueOf(row.getString("status")), row.getString("message"), row.getString("internal_note"),
    )) }
    private val admissionMapper = RowMapper { row, _ -> snapshot(row, AdmissionFields(
        AdmissionStatus.valueOf(row.getString("status")), row.getString("message"), row.getString("internal_note"),
    )) }
    private fun <F> snapshot(row: ResultSet, fields: F) = DecisionSnapshot(
        fields, row.getLong("version"), row.getTimestamp("updated_at").toInstant(), row.getObject("actor_id", UUID::class.java),
    )

    fun paperwork(id: UUID): DecisionSnapshot<PaperworkFields> = jdbc.query(
        """select revision.* from onboarding.paperwork p join onboarding.paperwork_revision revision
           on revision.volunteer_id = p.volunteer_id and revision.version = p.version where p.volunteer_id = ?""",
        paperworkMapper, id,
    ).singleOrNull() ?: DecisionSnapshot(PaperworkFields(PaperworkStatus.NOT_CONFIRMED, ""), 0, null, null)

    fun paperworkHistory(id: UUID, version: Long) = jdbc.query(
        "select * from onboarding.paperwork_revision where volunteer_id = ? and version <= ? order by version desc limit 50",
        paperworkMapper, id, version,
    )

    fun lockPaperwork(id: UUID) {
        jdbc.update("insert into onboarding.paperwork (volunteer_id) values (?) on conflict do nothing", id)
        jdbc.queryForObject("select version from onboarding.paperwork where volunteer_id = ? for update", Long::class.java, id)
    }

    fun appendPaperwork(id: UUID, version: Long, fields: PaperworkFields, actor: UUID): DecisionSnapshot<PaperworkFields> {
        val saved = jdbc.query(
            """insert into onboarding.paperwork_revision (volunteer_id, version, status, message, internal_note, actor_id)
               values (?, ?, ?, ?, ?, ?) returning *""",
            paperworkMapper, id, version, fields.status.name, fields.message, fields.internalNote, actor,
        ).single()
        jdbc.update("update onboarding.paperwork set version = ? where volunteer_id = ?", version, id)
        return saved
    }

    fun admission(id: UUID, roleId: UUID): DecisionSnapshot<AdmissionFields> = jdbc.query(
        """select revision.* from onboarding.role_admission a join onboarding.role_admission_revision revision
           on revision.volunteer_id = a.volunteer_id and revision.role_id = a.role_id and revision.version = a.version
           where a.volunteer_id = ? and a.role_id = ?""", admissionMapper, id, roleId,
    ).singleOrNull() ?: DecisionSnapshot(AdmissionFields(AdmissionStatus.NOT_GRANTED, ""), 0, null, null)

    fun admissionHistory(id: UUID, roleId: UUID, version: Long) = jdbc.query(
        "select * from onboarding.role_admission_revision where volunteer_id = ? and role_id = ? and version <= ? order by version desc limit 50",
        admissionMapper, id, roleId, version,
    )

    fun lockAdmission(id: UUID, roleId: UUID) {
        jdbc.update("insert into onboarding.role_admission (volunteer_id, role_id) values (?, ?) on conflict do nothing", id, roleId)
        jdbc.queryForObject("select version from onboarding.role_admission where volunteer_id = ? and role_id = ? for update", Long::class.java, id, roleId)
    }

    fun appendAdmission(id: UUID, roleId: UUID, version: Long, fields: AdmissionFields, actor: UUID): DecisionSnapshot<AdmissionFields> {
        val saved = jdbc.query(
            """insert into onboarding.role_admission_revision (volunteer_id, role_id, version, status, message, internal_note, actor_id)
               values (?, ?, ?, ?, ?, ?, ?) returning *""",
            admissionMapper, id, roleId, version, fields.status.name, fields.message, fields.internalNote, actor,
        ).single()
        jdbc.update("update onboarding.role_admission set version = ? where volunteer_id = ? and role_id = ?", version, id, roleId)
        return saved
    }

    /** Select only public columns: internal notes and staff identities cannot enter the volunteer projection. */
    fun ownAdmissions(id: UUID): List<AdmissionSummary> = jdbc.query(
        """select r.id, r.name, r.description, r.version, revision.status, revision.message, revision.updated_at
           from onboarding.role_admission a join onboarding.volunteer_role r on r.id = a.role_id
           join onboarding.role_admission_revision revision on revision.volunteer_id = a.volunteer_id
           and revision.role_id = a.role_id and revision.version = a.version
           where a.volunteer_id = ? order by lower(r.name), r.id""",
        { row, _ -> AdmissionSummary(
            VolunteerRole(row.getObject("id", UUID::class.java), row.getString("name"), row.getString("description"), row.getLong("version")),
            AdmissionStatus.valueOf(row.getString("status")), row.getString("message"), row.getTimestamp("updated_at").toInstant(),
        ) }, id,
    )
}
