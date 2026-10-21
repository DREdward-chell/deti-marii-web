package org.detimarii.platform.volunteers.internal

import jakarta.validation.Valid
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/volunteers/me")
class MyProfileController(private val profiles: MyProfileService) {
    @GetMapping
    fun get(): ProfileView = profiles.get()

    @PutMapping
    fun save(@Valid @RequestBody request: SaveProfileRequest): ProfileView = profiles.save(request)
}
