package org.detimarii.platform.learning.internal

import org.detimarii.platform.identity.CurrentAccount
import org.detimarii.platform.learning.CourseContent
import org.detimarii.platform.learning.CourseDraft
import org.detimarii.platform.learning.CourseListItem
import org.detimarii.platform.learning.CourseManagement
import org.detimarii.platform.learning.LessonType
import org.detimarii.platform.learning.PublishCourseRequest
import org.detimarii.platform.learning.SaveCourseRequest
import org.detimarii.platform.learning.WithdrawCourseRequest
import org.detimarii.platform.volunteers.VolunteerProfiles
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
@Validated
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class StaffCourseService(private val courses: LearningRepository, private val account: CurrentAccount, private val profiles: VolunteerProfiles) : CourseManagement {
    @Transactional(readOnly = true)
    override fun list() = courses.drafts().map { CourseListItem(it.id, it.content.title, it.revision, it.publishedVersion, it.publishedRevision) }
    @Transactional override fun create() = courses.create(account.id())
    @Transactional(readOnly = true) override fun get(id: UUID) = requireDraft(id)
    @Transactional
    override fun save(id: UUID, request: SaveCourseRequest): CourseDraft {
        val current = requireDraft(id, true)
        val content = request.content.normalized()
        validateIds(content)
        if (current.content == content) return current
        requireRevision(current, request.revision)
        return courses.save(id, content, account.id())
    }
    @Transactional
    override fun publish(id: UUID, request: PublishCourseRequest): CourseDraft {
        val draft = requireDraft(id, true)
        requireRevision(draft, request.revision)
        validatePublication(draft.content)
        if (draft.publishedRevision == draft.revision) return draft
        return courses.publish(draft, account.id())
    }
    @Transactional
    override fun withdraw(id: UUID, request: WithdrawCourseRequest): CourseDraft {
        val draft = requireDraft(id, true)
        if (draft.publishedVersion == null) return draft
        if (draft.publishedVersion != request.publishedVersion) throw ResponseStatusException(HttpStatus.CONFLICT, "Опубликована другая версия. Обновите маршрут.")
        return courses.withdraw(draft, account.id())
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    override fun progress(volunteerId: UUID) = run {
        if (!profiles.exists(volunteerId)) throw ResponseStatusException(HttpStatus.NOT_FOUND, "Анкета не найдена.")
        courses.enrollments(volunteerId).map { courses.summary(it, courses.publication(it.courseId, it.version)!!) }
    }
    private fun requireDraft(id: UUID, lock: Boolean = false) = courses.draft(id, lock)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Маршрут не найден.")
    private fun requireRevision(draft: CourseDraft, revision: Long) {
        if (draft.revision != revision) throw ResponseStatusException(HttpStatus.CONFLICT, "Черновик уже изменён. Загрузите актуальную версию.")
    }
    private fun invalid(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)
    private fun validateIds(content: CourseContent) {
        if (content.lessons.map { it.id }.distinct().size != content.lessons.size) invalid("Уроки должны иметь разные идентификаторы.")
        content.lessons.forEach { if (it.options.map { option -> option.id }.distinct().size != it.options.size) invalid("Варианты внутри урока должны быть разными.") }
    }
    private fun validatePublication(content: CourseContent) {
        validateIds(content)
        if (content.title.isBlank() || content.lessons.isEmpty()) invalid("Для публикации укажите название и добавьте хотя бы один урок.")
        content.lessons.forEachIndexed { index, lesson ->
            val name = "Урок ${index + 1}"
            if (lesson.title.isBlank() || lesson.body.isBlank()) invalid("$name: заполните название и материал.")
            if (lesson.type == LessonType.READ) {
                if (lesson.options.isNotEmpty() || lesson.correctOptionId != null) invalid("$name: материал для чтения не должен содержать варианты ответа.")
            } else {
                if (lesson.options.size < 2 || lesson.options.any { it.text.isBlank() } || lesson.explanation.isBlank()) invalid("$name: нужны хотя бы два заполненных варианта и объяснение ответа.")
                if (lesson.type == LessonType.SINGLE_CHOICE && lesson.options.none { it.id == lesson.correctOptionId }) invalid("$name: выберите правильный ответ.")
                if (lesson.type == LessonType.ORDERING && lesson.correctOptionId != null) invalid("$name: правильный порядок задаётся расположением элементов.")
            }
        }
    }
}
