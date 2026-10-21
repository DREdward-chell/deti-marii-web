package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.awaitility.Awaitility.await
import org.detimarii.testsupport.EventRegistryProbeConfiguration
import org.detimarii.testsupport.RegistryProbe
import org.detimarii.testsupport.RegistryProbeEvent
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.ApplicationEventPublisher
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.modulith.events.FailedEventPublications
import org.springframework.modulith.events.ResubmissionOptions
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Duration
import java.time.Instant
import java.util.UUID

@SpringBootTest(properties = ["POSTGRES_PASSWORD=testcontainers"])
@Import(TestcontainersConfiguration::class, EventRegistryProbeConfiguration::class)
class EventPublicationIntegrationTests @Autowired constructor(
    private val jdbc: JdbcTemplate,
    private val publisher: ApplicationEventPublisher,
    private val failedPublications: FailedEventPublications,
    private val probe: RegistryProbe,
    transactionManager: PlatformTransactionManager,
) {
    private val transaction = TransactionTemplate(transactionManager)

    @BeforeEach
    fun createTestFixture() {
        jdbc.execute("create table if not exists public.registry_test_change (id uuid primary key)")
    }

    @Test
    fun `publication is stored with the business change and handled only after commit`() {
        val event = event()
        val publishingThreadId = Thread.currentThread().threadId()

        transaction.executeWithoutResult {
            recordChangeAndPublish(event)
            assertThat(publicationStatus(event)).isEqualTo("PUBLISHED")
            assertThat(probe.received).doesNotContain(event)
        }

        await().atMost(Duration.ofSeconds(10)).untilAsserted {
            assertThat(publicationStatus(event)).isEqualTo("COMPLETED")
            assertThat(probe.received).contains(event)
        }
        assertThat(changeCount(event)).isEqualTo(1)
        assertThat(probe.handlingThreadIds[event.id]).isNotNull().isNotEqualTo(publishingThreadId)
    }

    @Test
    fun `rollback removes both the business change and its publication`() {
        val event = event()

        assertThatThrownBy {
            transaction.executeWithoutResult {
                recordChangeAndPublish(event)
                assertThat(publicationStatus(event)).isEqualTo("PUBLISHED")
                throw IllegalStateException("Simulated business rollback")
            }
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Simulated business rollback")

        assertThat(changeCount(event)).isZero()
        assertThat(publicationStatus(event)).isNull()
        assertThat(probe.received).doesNotContain(event)
    }

    @Test
    fun `failed listener leaves the business change committed and can replay the stored event`() {
        val event = event()
        probe.failFor.add(event.id)

        transaction.executeWithoutResult { recordChangeAndPublish(event) }

        await().atMost(Duration.ofSeconds(10)).untilAsserted {
            assertThat(publicationStatus(event)).isEqualTo("FAILED")
        }
        assertThat(changeCount(event)).isEqualTo(1)
        assertThat(probe.received).doesNotContain(event)

        probe.failFor.remove(event.id)
        failedPublications.resubmit(
            ResubmissionOptions.defaults().withFilter { it.event == event },
        )

        await().atMost(Duration.ofSeconds(10)).untilAsserted {
            assertThat(publicationStatus(event)).isEqualTo("COMPLETED")
            assertThat(probe.received.filter { it.id == event.id }).containsExactly(event)
        }
        assertThat(changeCount(event)).isEqualTo(1)
    }

    private fun recordChangeAndPublish(event: RegistryProbeEvent) {
        jdbc.update("insert into public.registry_test_change (id) values (?)", event.id)
        publisher.publishEvent(event)
    }

    private fun publicationStatus(event: RegistryProbeEvent): String? = jdbc.queryForList(
        "select status from public.event_publication where serialized_event::jsonb ->> 'id' = ?",
        String::class.java,
        event.id.toString(),
    ).singleOrNull()

    private fun changeCount(event: RegistryProbeEvent): Int = jdbc.queryForObject(
        "select count(*) from public.registry_test_change where id = ?",
        Int::class.java,
        event.id,
    )!!

    private fun event() = RegistryProbeEvent(
        UUID.randomUUID(),
        Instant.parse("2026-10-21T12:00:00Z"),
        "Тестовое событие без персональных данных",
    )
}
