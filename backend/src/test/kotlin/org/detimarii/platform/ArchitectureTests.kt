package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules

class ArchitectureTests {
    @Test
    fun `module boundaries have no cycles or access to internals`() {
        val modules = ApplicationModules.of(VolunteerPlatformApplication::class.java)
        modules.verify()
        assertThat(modules.getModuleByName("onboarding")).isPresent
        assertThat(modules.getModuleByName("learning")).isPresent
    }
}
