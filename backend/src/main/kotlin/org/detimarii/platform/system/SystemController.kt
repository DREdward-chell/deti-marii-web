package org.detimarii.platform.system

import org.springframework.boot.info.BuildProperties
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/system")
class SystemController(private val buildProperties: BuildProperties) {
    @GetMapping("/info")
    fun info(): SystemInfo = SystemInfo(
        name = "volunteer-platform",
        version = requireNotNull(buildProperties.version) { "Build version is missing" },
    )
}

data class SystemInfo(val name: String, val version: String)
