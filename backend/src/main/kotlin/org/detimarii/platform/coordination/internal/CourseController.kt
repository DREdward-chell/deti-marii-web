package org.detimarii.platform.coordination.internal

import jakarta.validation.Valid
import org.detimarii.platform.learning.CourseManagement
import org.detimarii.platform.learning.PublishCourseRequest
import org.detimarii.platform.learning.SaveCourseRequest
import org.detimarii.platform.learning.WithdrawCourseRequest
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/v1/coordination")
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class CourseController(private val courses: CourseManagement) {
    @GetMapping("/learning/courses") fun list() = courses.list()
    @PostMapping("/learning/courses") @ResponseStatus(HttpStatus.CREATED) fun create() = courses.create()
    @GetMapping("/learning/courses/{id}") fun get(@PathVariable id: UUID) = courses.get(id)
    @PutMapping("/learning/courses/{id}") fun save(@PathVariable id: UUID, @Valid @RequestBody request: SaveCourseRequest) = courses.save(id, request)
    @PostMapping("/learning/courses/{id}/publish") fun publish(@PathVariable id: UUID, @Valid @RequestBody request: PublishCourseRequest) = courses.publish(id, request)
    @PostMapping("/learning/courses/{id}/withdraw") fun withdraw(@PathVariable id: UUID, @Valid @RequestBody request: WithdrawCourseRequest) = courses.withdraw(id, request)
    @GetMapping("/volunteers/{id}/learning") fun progress(@PathVariable id: UUID) = courses.progress(id)
}
