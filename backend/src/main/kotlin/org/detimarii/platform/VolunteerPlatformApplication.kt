package org.detimarii.platform

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableAsync

@SpringBootApplication
@EnableAsync
class VolunteerPlatformApplication

fun main(args: Array<String>) {
    runApplication<VolunteerPlatformApplication>(*args)
}
