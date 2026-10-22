package org.detimarii.platform.learning.internal

import jakarta.validation.Valid
import org.detimarii.platform.learning.LessonAnswerRequest
import org.detimarii.platform.learning.StartCourseRequest
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/v1/learning")
class MyLearningController(private val learning: MyLearningService) {
    @GetMapping("/courses") fun list() = learning.list()
    @PostMapping("/courses/{id}/start") fun start(@PathVariable id: UUID, @Valid @RequestBody request: StartCourseRequest) = learning.start(id, request)
    @GetMapping("/enrollments/{id}") fun get(@PathVariable id: UUID) = learning.get(id)
    @PostMapping("/enrollments/{id}/answers") fun answer(@PathVariable id: UUID, @Valid @RequestBody request: LessonAnswerRequest) = learning.answer(id, request)
}
