package org.detimarii.platform

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class VolunteerPlatformApplication

fun main(args: Array<String>) {
    runApplication<VolunteerPlatformApplication>(*args)
}
