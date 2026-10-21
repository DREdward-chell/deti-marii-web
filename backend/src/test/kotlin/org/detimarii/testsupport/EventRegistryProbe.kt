package org.detimarii.testsupport

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.modulith.events.ApplicationModuleListener
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

data class RegistryProbeEvent(val id: UUID, val occurredAt: Instant, val message: String)

class RegistryProbe {
    val received = ConcurrentLinkedQueue<RegistryProbeEvent>()
    val handlingThreadIds = ConcurrentHashMap<UUID, Long>()
    val failFor: MutableSet<UUID> = ConcurrentHashMap.newKeySet()
}

open class RegistryProbeListener(private val probe: RegistryProbe) {
    @ApplicationModuleListener
    open fun receive(event: RegistryProbeEvent) {
        check(event.id !in probe.failFor) { "Simulated listener failure for ${event.id}" }
        probe.handlingThreadIds[event.id] = Thread.currentThread().threadId()
        probe.received.add(event)
    }
}

@TestConfiguration(proxyBeanMethods = false)
class EventRegistryProbeConfiguration {
    @Bean
    fun registryProbe() = RegistryProbe()

    @Bean
    fun registryProbeListener(probe: RegistryProbe) = RegistryProbeListener(probe)
}
