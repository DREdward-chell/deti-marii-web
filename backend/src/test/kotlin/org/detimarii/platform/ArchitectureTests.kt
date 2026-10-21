package org.detimarii.platform

import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules

class ArchitectureTests {
    @Test
    fun `module boundaries have no cycles or access to internals`() {
        ApplicationModules.of(VolunteerPlatformApplication::class.java).verify()
    }
}
