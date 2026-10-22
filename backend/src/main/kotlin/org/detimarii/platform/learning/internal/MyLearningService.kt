package org.detimarii.platform.learning.internal

import org.detimarii.platform.learning.AnswerFeedback
import org.detimarii.platform.learning.AvailableCourse
import org.detimarii.platform.learning.CourseAudience
import org.detimarii.platform.learning.EnrollmentView
import org.detimarii.platform.learning.LearnerLesson
import org.detimarii.platform.learning.LessonAnswerRequest
import org.detimarii.platform.learning.LessonType
import org.detimarii.platform.learning.StartCourseRequest
import org.detimarii.platform.onboarding.VolunteerClearanceReader
import org.detimarii.platform.volunteers.VolunteerProfiles
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
@PreAuthorize("hasRole('VOLUNTEER')")
class MyLearningService(private val courses: LearningRepository, private val profiles: VolunteerProfiles, private val clearance: VolunteerClearanceReader) {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun list(): List<AvailableCourse> {
        val volunteerId = ownId()
        val paperwork = clearance.own().hasConfirmedPaperwork()
        val enrollments = courses.enrollments(volunteerId)
        return courses.publications().filter { allowed(it, paperwork) }.map { publication ->
            val history = enrollments.filter { it.courseId == publication.courseId }.mapNotNull { enrollment ->
                val pinned = courses.publication(enrollment.courseId, enrollment.version)!!
                if (allowed(pinned, paperwork)) courses.summary(enrollment, pinned) else null
            }
            AvailableCourse(publication.courseId, publication.content.title, publication.content.description, publication.version,
                publication.content.demo, publication.content.lessons.size, history)
        }
    }
    @Transactional
    fun start(courseId: UUID, request: StartCourseRequest): EnrollmentView {
        val volunteerId = ownId()
        val draft = courses.draft(courseId, true) ?: missing()
        val current = draft.publishedVersion?.let { courses.publication(courseId, it) } ?: missing()
        requireAccess(current, current)
        if (current.version != request.version) throw ResponseStatusException(HttpStatus.CONFLICT, "У маршрута новая версия. Обновите список обучения.")
        return view(courses.start(volunteerId, courseId, current.version), current)
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun get(id: UUID): EnrollmentView {
        val enrollment = courses.enrollment(id, ownId()) ?: missing()
        val current = current(enrollment.courseId)
        val pinned = courses.publication(enrollment.courseId, enrollment.version)!!
        requireAccess(current, pinned)
        return view(enrollment, pinned)
    }
    @Transactional
    fun answer(id: UUID, request: LessonAnswerRequest): EnrollmentView {
        val volunteerId = ownId()
        val found = courses.enrollment(id, volunteerId) ?: missing()
        // All writers acquire the course before the enrollment; publication/withdrawal cannot race this write.
        val current = current(found.courseId, lock = true)
        val enrollment = courses.enrollment(id, volunteerId, lock = true) ?: missing()
        val pinned = courses.publication(enrollment.courseId, enrollment.version)!!
        requireAccess(current, pinned)
        val answer = AnswerData(request.optionId, request.order)
        val attempts = courses.attempts(id)
        val retried = attempts.find { it.requestId == request.requestId }
        if (retried != null) {
            if (retried.lessonId != request.lessonId || retried.answer != answer) throw ResponseStatusException(HttpStatus.CONFLICT, "Этот запрос уже использован для другого ответа.")
            return view(enrollment, pinned)
        }
        val completed = attempts.filter { it.correct }.map { it.lessonId }.toSet()
        val next = pinned.content.lessons.firstOrNull { it.id !in completed }
        if (next?.id != request.lessonId) throw ResponseStatusException(HttpStatus.CONFLICT, "Шаг уже завершён или ещё недоступен. Обновите прохождение.")
        val correct = when (next.type) {
            LessonType.READ -> {
                if (answer.optionId != null || answer.order.isNotEmpty()) invalid()
                true
            }
            LessonType.SINGLE_CHOICE -> {
                if (answer.order.isNotEmpty() || next.options.none { it.id == answer.optionId }) invalid()
                answer.optionId == next.correctOptionId
            }
            LessonType.ORDERING -> {
                if (answer.optionId != null || answer.order.size != next.options.size || answer.order.toSet() != next.options.map { it.id }.toSet()) invalid()
                answer.order == next.options.map { it.id }
            }
        }
        courses.answer(id, request.requestId, request.lessonId, answer, correct)
        if (correct && completed.size + 1 == pinned.content.lessons.size) courses.complete(id)
        return view(courses.enrollment(id, volunteerId)!!, pinned)
    }
    private fun ownId() = profiles.ownId() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Сначала сохраните свою анкету.")
    private fun current(id: UUID, lock: Boolean = false): PublishedCourse {
        val draft = courses.draft(id, lock) ?: missing()
        return draft.publishedVersion?.let { courses.publication(id, it) } ?: missing()
    }
    private fun allowed(publication: PublishedCourse, paperwork: Boolean) = publication.content.audience == CourseAudience.ALL_VOLUNTEERS || paperwork
    private fun requireAccess(current: PublishedCourse, pinned: PublishedCourse) {
        val paperwork = clearance.own().hasConfirmedPaperwork()
        // An old enrollment cannot bypass a tighter current policy; an old private version stays private.
        if (!allowed(current, paperwork) || !allowed(pinned, paperwork)) throw ResponseStatusException(HttpStatus.FORBIDDEN, "Для этого материала нужно подтверждённое оформление.")
    }
    private fun view(enrollment: Enrollment, publication: PublishedCourse): EnrollmentView {
        val attempts = courses.attempts(enrollment.id)
        val completed = attempts.filter { it.correct }.map { it.lessonId }.toSet()
        var available = true
        val lessons = publication.content.lessons.map { lesson ->
            val unlocked = available
            val done = lesson.id in completed
            if (!done) available = false
            val attempt = attempts.firstOrNull { it.lessonId == lesson.id }
            LearnerLesson(lesson.id, lesson.title, if (unlocked) lesson.body else "", lesson.type,
                if (unlocked) lesson.options.sortedBy { it.id.toString() } else emptyList(), unlocked, done,
                attempt?.let { AnswerFeedback(it.correct, lesson.explanation, it.answer.optionId, it.answer.order) })
        }
        return EnrollmentView(courses.summary(enrollment, publication, attempts), publication.content.description, publication.content.demo, lessons)
    }
    private fun missing(): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND, "Прохождение или опубликованный маршрут не найден.")
    private fun invalid(): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Ответ не соответствует заданию.")
}
