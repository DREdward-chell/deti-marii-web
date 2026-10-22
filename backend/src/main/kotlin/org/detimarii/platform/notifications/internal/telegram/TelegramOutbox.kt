package org.detimarii.platform.notifications.internal.telegram

import org.detimarii.platform.notifications.VolunteerNotifications
import org.detimarii.platform.onboarding.VolunteerUpdate
import org.detimarii.platform.volunteers.VolunteerProfiles
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class TelegramOutbox(private val jdbc: JdbcTemplate, private val profiles: VolunteerProfiles) : VolunteerNotifications {
    @EventListener
    @Transactional
    fun changed(event: VolunteerUpdate) {
        profiles.accountId(event.volunteerId)?.let { enqueue(it, event.key, event.message) }
    }

    @Transactional
    override fun enqueue(accountId: UUID, eventKey: String, message: String) {
        require(message.isNotBlank() && message.length <= 3000)
        require(eventKey.isNotBlank() && eventKey.length <= 250)
        jdbc.update("""insert into notifications.telegram_outbox(id, deduplication_key, account_id, chat_id, message)
            select ?, ?, account_id, chat_id, ? from notifications.telegram_link
            where account_id = ? and chat_id is not null on conflict(deduplication_key) do nothing""",
            UUID.randomUUID(), "event:$accountId:$eventKey", message, accountId)
    }

    fun reply(updateId: Long, chatId: Long, message: String) {
        jdbc.update("""insert into notifications.telegram_outbox(id, deduplication_key, chat_id, message)
            values (?, ?, ?, ?) on conflict(deduplication_key) do nothing""", UUID.randomUUID(), "reply:$updateId", chatId, message)
    }
}
