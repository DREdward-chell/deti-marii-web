package org.detimarii.platform.learning

import jakarta.validation.Valid
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

enum class CourseAudience { ALL_VOLUNTEERS, CONFIRMED_PAPERWORK }
enum class LessonType { READ, SINGLE_CHOICE, ORDERING }
data class LessonOption(val id: UUID, @field:Size(max = 500) val text: String)
data class LessonContent(
    val id: UUID, @field:Size(max = 150) val title: String, @field:Size(max = 10000) val body: String,
    val type: LessonType, @field:Valid @field:Size(max = 8) val options: List<LessonOption> = emptyList(),
    val correctOptionId: UUID? = null, @field:Size(max = 2000) val explanation: String = "",
)
data class CourseContent(
    @field:Size(max = 150) val title: String = "Новый маршрут",
    @field:Size(max = 2000) val description: String = "",
    val audience: CourseAudience = CourseAudience.ALL_VOLUNTEERS,
    val demo: Boolean = false,
    @field:Valid @field:Size(max = 40) val lessons: List<LessonContent> = emptyList(),
) {
    fun normalized() = copy(title = title.trim(), description = description.trim(), lessons = lessons.map {
        it.copy(title = it.title.trim(), body = it.body.trim(), explanation = it.explanation.trim(),
            options = it.options.map { option -> option.copy(text = option.text.trim()) })
    })
}
data class CourseDraft(
    val id: UUID, val revision: Long, val content: CourseContent,
    val publishedVersion: Int?, val publishedRevision: Long?,
)
data class CourseListItem(val id: UUID, val title: String, val revision: Long, val publishedVersion: Int?, val publishedRevision: Long?)
data class SaveCourseRequest(@field:PositiveOrZero val revision: Long, @field:Valid val content: CourseContent)
data class PublishCourseRequest(@field:PositiveOrZero val revision: Long)
data class WithdrawCourseRequest(@field:Positive val publishedVersion: Int)
data class EnrollmentSummary(
    val id: UUID, val courseId: UUID, val title: String, val version: Int, val completedLessons: Int,
    val totalLessons: Int, val startedAt: Instant, val completedAt: Instant?,
)
data class AvailableCourse(
    val id: UUID, val title: String, val description: String, val version: Int, val demo: Boolean,
    val totalLessons: Int, val enrollments: List<EnrollmentSummary>,
)
data class StartCourseRequest(@field:Positive val version: Int)
data class LessonAnswerRequest(
    val requestId: UUID, val lessonId: UUID, val optionId: UUID? = null,
    @field:Size(max = 8) val order: List<UUID> = emptyList(),
)
data class AnswerFeedback(val correct: Boolean, val explanation: String, val optionId: UUID?, val order: List<UUID>)
/** No answer key and no authored ordering in this projection. Locked lessons contain titles only. */
data class LearnerLesson(
    val id: UUID, val title: String, val body: String, val type: LessonType, val options: List<LessonOption>,
    val available: Boolean, val completed: Boolean, val feedback: AnswerFeedback?,
)
data class EnrollmentView(val summary: EnrollmentSummary, val description: String, val demo: Boolean, val lessons: List<LearnerLesson>)

interface CourseManagement {
    fun list(): List<CourseListItem>
    fun create(): CourseDraft
    fun get(id: UUID): CourseDraft
    fun save(id: UUID, @Valid request: SaveCourseRequest): CourseDraft
    fun publish(id: UUID, @Valid request: PublishCourseRequest): CourseDraft
    fun withdraw(id: UUID, @Valid request: WithdrawCourseRequest): CourseDraft
    fun progress(volunteerId: UUID): List<EnrollmentSummary>
}
