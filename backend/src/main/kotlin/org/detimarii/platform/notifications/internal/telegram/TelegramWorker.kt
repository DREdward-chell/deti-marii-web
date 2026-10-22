package org.detimarii.platform.notifications.internal.telegram

import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

@Component
class TelegramWorker(
    private val jdbc: JdbcTemplate, private val transactions: TransactionTemplate,
    private val api: TelegramApi, private val properties: TelegramProperties,
    private val links: TelegramLinks, private val outbox: TelegramOutbox,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private var pollAfter = 0L

    @Scheduled(fixedDelay = 2000)
    fun tick() {
        if (!properties.enabled || System.currentTimeMillis() < pollAfter) return
        try {
            if (System.currentTimeMillis() >= pollAfter) poll()
            repeat(10) { if (System.currentTimeMillis() >= pollAfter) deliver() }
        } catch (failure: TelegramFailure) {
            pollAfter = System.currentTimeMillis() + maxOf(30, failure.retryAfter.coerceAtMost(86400)) * 1000
            log.warn("Telegram temporarily unavailable; code={}", failure.code)
        } catch (_: Exception) {
            log.warn("Telegram worker failed; retrying on the next tick")
        }
    }

    fun poll() {
        transactions.executeWithoutResult {
            // One active poller across replicas. Offset and command effects commit together.
            val offset = jdbc.query("select next_update from notifications.telegram_cursor where id = 1 for update skip locked",
                { row, _ -> row.getLong(1) }).singleOrNull() ?: return@executeWithoutResult
            val updates = api.call("getUpdates", mapOf("offset" to offset, "timeout" to 0, "limit" to 50, "allowed_updates" to listOf("message")))
            for (update in updates) {
                val id = update.path("update_id").asLong()
                if (id < offset) continue
                val message = update.path("message")
                val chat = message.path("chat")
                val chatId = chat.path("id").asLong()
                if (chat.path("type").asText() == "private" && message.path("from").path("id").asLong() == chatId) {
                    val text = message.path("text").asText("").trim()
                    val parts = text.split(Regex("\\s+"), limit = 2)
                    val command = parts[0].substringBefore('@')
                    val reply = when (command) {
                        "/start" -> if (parts.size == 2) {
                            if (links.bind(parts[1], chatId)) "Telegram подключён. Здесь будут уведомления об изменениях в вашем кабинете. Отключить: /stop."
                            else "Ссылка недействительна или истекла. Получите новую в личном кабинете. Если этот Telegram уже подключён к другому аккаунту, сначала отправьте /stop."
                        } else "Привет! Это пространство волонтёров «Дети Марии». Для уведомлений подключите Telegram в личном кабинете: ${properties.siteUrl}"
                        "/stop" -> {
                            links.accountForChat(chatId)?.let(links::unlink)
                            "Уведомления отключены. Подключить их снова можно в личном кабинете."
                        }
                        "/status", "/settings" -> if (links.accountForChat(chatId) != null) "Telegram подключён. Отключить уведомления: /stop."
                            else "Telegram не подключён. Откройте личный кабинет: ${properties.siteUrl}"
                        else -> "Я сообщаю об изменениях анкеты, документов и допусков. /status — подключение, /stop — отключить. Вопросы координатору задавайте через фонд. Кабинет: ${properties.siteUrl}"
                    }
                    outbox.reply(id, chatId, reply)
                }
                jdbc.update("update notifications.telegram_cursor set next_update = ? where id = 1", id + 1)
            }
        }
    }

    fun deliver() {
        transactions.executeWithoutResult {
            val item = jdbc.query("""select * from notifications.telegram_outbox
                where state = 'PENDING' and available_at <= now() order by available_at
                limit 1 for update skip locked""", { row, _ -> Delivery(
                row.getObject("id", UUID::class.java), row.getObject("account_id", UUID::class.java),
                row.getLong("chat_id"), row.getString("message"), row.getInt("attempts"),
            ) }).singleOrNull() ?: return@executeWithoutResult
            // Serialize disconnect with delivery, and never send an old notification to a new binding.
            if (item.accountId != null) {
                val current = jdbc.query("select chat_id from notifications.telegram_link where account_id = ? for update",
                    { row, _ -> row.getObject(1) as? Long }, item.accountId).singleOrNull()
                if (current != item.chatId) {
                    jdbc.update("update notifications.telegram_outbox set state = 'CANCELLED' where id = ?", item.id)
                    return@executeWithoutResult
                }
            }
            try {
                api.call("sendMessage", mapOf("chat_id" to item.chatId,
                    "text" to "${item.message}\n\nЛичный кабинет: ${properties.siteUrl}",
                    "link_preview_options" to mapOf("is_disabled" to true)))
                jdbc.update("update notifications.telegram_outbox set state = 'SENT' where id = ?", item.id)
            } catch (failure: TelegramFailure) {
                val attempts = item.attempts + 1
                val retry = attempts < 8 && (failure.code == 429 || failure.code >= 500)
                val delay = maxOf(failure.retryAfter.coerceIn(0, 86400), (1L shl attempts.coerceAtMost(12)) * 5)
                jdbc.update("""update notifications.telegram_outbox set attempts = ?, state = ?,
                    available_at = now() + (? * interval '1 second') where id = ?""",
                    attempts, if (retry) "PENDING" else "FAILED", delay, item.id)
                if (failure.code == 403 && item.accountId != null) links.unlink(item.accountId)
                if (failure.code == 429) pollAfter = System.currentTimeMillis() + delay * 1000
            }
        }
    }

    @Scheduled(fixedDelay = 86400000)
    fun clean() {
        jdbc.update("delete from notifications.telegram_outbox where created_at < now() - interval '30 days'")
        jdbc.update("update notifications.telegram_link set token_hash = null, expires_at = null where expires_at < now()")
    }
    private data class Delivery(val id: UUID, val accountId: UUID?, val chatId: Long, val message: String, val attempts: Int)
}
