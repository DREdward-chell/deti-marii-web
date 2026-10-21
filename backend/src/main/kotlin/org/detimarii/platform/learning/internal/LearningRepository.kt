package org.detimarii.platform.learning.internal

import org.detimarii.platform.learning.CourseContent
import org.detimarii.platform.learning.CourseDraft
import org.detimarii.platform.learning.EnrollmentSummary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

data class PublishedCourse(val courseId: UUID, val version: Int, val content: CourseContent)
data class Enrollment(val id: UUID, val volunteerId: UUID, val courseId: UUID, val version: Int, val startedAt: Instant, val completedAt: Instant?)
data class AnswerData(val optionId: UUID?, val order: List<UUID>)
data class Attempt(val requestId: UUID, val lessonId: UUID, val answer: AnswerData, val correct: Boolean)

@Repository
class LearningRepository(private val jdbc: JdbcTemplate, private val json: ObjectMapper) {
    private val draftMapper = RowMapper { row, _ -> CourseDraft(
        row.getObject("id", UUID::class.java), row.getLong("revision"), json.readValue(row.getString("draft"), CourseContent::class.java),
        row.getObject("published_version", Int::class.javaObjectType), row.getObject("published_revision", Long::class.javaObjectType),
    ) }
    private val publicationMapper = RowMapper { row, _ -> PublishedCourse(
        row.getObject("course_id", UUID::class.java), row.getInt("version"), json.readValue(row.getString("content"), CourseContent::class.java),
    ) }
    private val enrollmentMapper = RowMapper { row, _ -> Enrollment(
        row.getObject("id", UUID::class.java), row.getObject("volunteer_id", UUID::class.java), row.getObject("course_id", UUID::class.java),
        row.getInt("course_version"), row.getTimestamp("started_at").toInstant(), row.getTimestamp("completed_at")?.toInstant(),
    ) }

    fun drafts(): List<CourseDraft> = jdbc.query("select * from learning.course order by updated_at desc, id", draftMapper)
    fun draft(id: UUID, lock: Boolean = false): CourseDraft? = jdbc.query(
        "select * from learning.course where id = ?" + if (lock) " for update" else "", draftMapper, id,
    ).singleOrNull()
    fun create(actor: UUID): CourseDraft {
        val draft = jdbc.query("insert into learning.course (id, draft, updated_by) values (?, ?::jsonb, ?) returning *",
            draftMapper, UUID.randomUUID(), json.writeValueAsString(CourseContent()), actor).single()
        audit(draft, "CREATE", actor)
        return draft
    }
    fun save(id: UUID, content: CourseContent, actor: UUID): CourseDraft {
        val draft = jdbc.query("update learning.course set draft = ?::jsonb, revision = revision + 1, updated_by = ?, updated_at = clock_timestamp() where id = ? returning *",
            draftMapper, json.writeValueAsString(content), actor, id).single()
        audit(draft, "SAVE", actor)
        return draft
    }
    fun publish(draft: CourseDraft, actor: UUID): CourseDraft {
        val version = jdbc.queryForObject("select publication_count + 1 from learning.course where id = ?", Int::class.java, draft.id)!!
        jdbc.update("insert into learning.course_version (course_id, version, source_revision, content, published_by) values (?, ?, ?, ?::jsonb, ?)",
            draft.id, version, draft.revision, json.writeValueAsString(draft.content), actor)
        val saved = jdbc.query("update learning.course set published_version = ?, published_revision = revision, publication_count = ?, updated_by = ?, updated_at = clock_timestamp() where id = ? returning *",
            draftMapper, version, version, actor, draft.id).single()
        audit(saved, "PUBLISH", actor)
        return saved
    }
    fun withdraw(draft: CourseDraft, actor: UUID): CourseDraft {
        audit(draft, "WITHDRAW", actor)
        return jdbc.query("update learning.course set published_version = null, published_revision = null, updated_by = ?, updated_at = clock_timestamp() where id = ? returning *",
            draftMapper, actor, draft.id).single()
    }
    private fun audit(draft: CourseDraft, action: String, actor: UUID) {
        jdbc.update("insert into learning.course_action (course_id, action, draft_revision, publication_version, actor_id) values (?, ?, ?, ?, ?)",
            draft.id, action, draft.revision, draft.publishedVersion, actor)
    }
    fun publications(): List<PublishedCourse> = jdbc.query(
        "select v.* from learning.course c join learning.course_version v on v.course_id = c.id and v.version = c.published_version order by v.published_at desc, c.id", publicationMapper,
    )
    fun publication(courseId: UUID, version: Int): PublishedCourse? = jdbc.query(
        "select * from learning.course_version where course_id = ? and version = ?", publicationMapper, courseId, version,
    ).singleOrNull()
    fun enrollments(volunteerId: UUID): List<Enrollment> = jdbc.query(
        "select * from learning.enrollment where volunteer_id = ? order by started_at desc, id", enrollmentMapper, volunteerId,
    )
    fun enrollment(id: UUID, volunteerId: UUID, lock: Boolean = false): Enrollment? = jdbc.query(
        "select * from learning.enrollment where id = ? and volunteer_id = ?" + if (lock) " for update" else "", enrollmentMapper, id, volunteerId,
    ).singleOrNull()
    fun start(volunteerId: UUID, courseId: UUID, version: Int): Enrollment {
        jdbc.update("insert into learning.enrollment (id, volunteer_id, course_id, course_version) values (?, ?, ?, ?) on conflict do nothing",
            UUID.randomUUID(), volunteerId, courseId, version)
        return jdbc.query("select * from learning.enrollment where volunteer_id = ? and course_id = ? and course_version = ?", enrollmentMapper, volunteerId, courseId, version).single()
    }
    fun attempts(enrollmentId: UUID): List<Attempt> = jdbc.query(
        "select * from learning.lesson_attempt where enrollment_id = ? order by id desc",
        { row, _ -> Attempt(row.getObject("request_id", UUID::class.java), row.getObject("lesson_id", UUID::class.java),
            json.readValue(row.getString("answer"), AnswerData::class.java), row.getBoolean("correct")) }, enrollmentId,
    )
    fun answer(id: UUID, requestId: UUID, lessonId: UUID, answer: AnswerData, correct: Boolean) {
        jdbc.update("insert into learning.lesson_attempt (enrollment_id, request_id, lesson_id, answer, correct) values (?, ?, ?, ?::jsonb, ?)",
            id, requestId, lessonId, json.writeValueAsString(answer), correct)
    }
    fun complete(enrollmentId: UUID) { jdbc.update("update learning.enrollment set completed_at = clock_timestamp() where id = ? and completed_at is null", enrollmentId) }
    fun summary(enrollment: Enrollment, publication: PublishedCourse, attempts: List<Attempt> = attempts(enrollment.id)) = EnrollmentSummary(
        enrollment.id, enrollment.courseId, publication.content.title, enrollment.version, attempts.filter { it.correct }.map { it.lessonId }.distinct().size,
        publication.content.lessons.size, enrollment.startedAt, enrollment.completedAt,
    )
}
