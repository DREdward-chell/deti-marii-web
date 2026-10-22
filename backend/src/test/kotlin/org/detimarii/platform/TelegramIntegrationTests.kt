package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.detimarii.platform.notifications.internal.telegram.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@SpringBootTest(properties = ["POSTGRES_PASSWORD=testcontainers"])
@Import(TestcontainersConfiguration::class)
@Transactional
class TelegramIntegrationTests @Autowired constructor(private val jdbc: JdbcTemplate, private val outbox: TelegramOutbox) {
    @Test
    fun `one-time links bind only one account and disconnect cancels pending delivery`() {
        val account = UUID.randomUUID()
        jdbc.update("insert into identity.account(id,email,password_hash) values (?,?,?)", account, "$account@example.test", "unused")
        val links = TelegramLinks(jdbc, TelegramProperties(true, "12345:test", "example_bot", "https://example.org"))
        val first = links.create(account).url.substringAfter("start=")
        val token = links.create(account).url.substringAfter("start=")
        assertThat(links.bind(first, 123)).isFalse()
        assertThat(links.bind(token, 123)).isTrue()
        assertThat(links.bind(token, 123)).isFalse()
        assertThat(links.status(account).linked).isTrue()
        outbox.enqueue(account, "review:1", "Изменён следующий шаг")
        outbox.enqueue(account, "review:1", "Изменён следующий шаг")
        assertThat(jdbc.queryForObject("select count(*) from notifications.telegram_outbox where account_id = ?", Int::class.java, account)).isEqualTo(1)
        links.unlink(account)
        assertThat(links.status(account).linked).isFalse()
        assertThat(jdbc.queryForObject("select state from notifications.telegram_outbox where account_id = ?", String::class.java, account)).isEqualTo("CANCELLED")
        outbox.enqueue(account, "review:2", "Ещё одно изменение")
        assertThat(jdbc.queryForObject("select count(*) from notifications.telegram_outbox where account_id = ?", Int::class.java, account)).isEqualTo(1)
    }
}
