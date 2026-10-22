package org.detimarii.platform.notifications.internal.telegram

import org.detimarii.platform.identity.CurrentAccount
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

internal fun tokenHash(token: String): String = MessageDigest.getInstance("SHA-256")
    .digest(token.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

data class TelegramStatus(val available: Boolean, val linked: Boolean)
data class TelegramLink(val url: String, val expiresInSeconds: Int = 600)

@Service
class TelegramLinks(private val jdbc: JdbcTemplate, private val properties: TelegramProperties) {
    fun status(accountId: UUID) = TelegramStatus(properties.enabled, jdbc.queryForObject(
        "select exists(select 1 from notifications.telegram_link where account_id = ? and chat_id is not null)",
        Boolean::class.java, accountId,
    )!!)

    @Transactional
    fun create(accountId: UUID): TelegramLink {
        if (!properties.enabled) throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Telegram-бот пока не подключён.")
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(SecureRandom()::nextBytes))
        jdbc.update("""insert into notifications.telegram_link(account_id, token_hash, expires_at)
            values (?, ?, now() + interval '10 minutes') on conflict(account_id) do update
            set token_hash = excluded.token_hash, expires_at = excluded.expires_at""", accountId, tokenHash(token))
        return TelegramLink("https://t.me/${properties.username}?start=$token")
    }

    @Transactional
    fun unlink(accountId: UUID) {
        jdbc.update("update notifications.telegram_link set chat_id = null, token_hash = null, expires_at = null, linked_at = null where account_id = ?", accountId)
        jdbc.update("update notifications.telegram_outbox set state = 'CANCELLED' where account_id = ? and state = 'PENDING'", accountId)
    }

    /** Called inside the polling transaction; row lock makes tokens single-use. */
    fun bind(token: String, chatId: Long): Boolean {
        if (!token.matches(Regex("[A-Za-z0-9_-]{43}"))) return false
        val accountId = jdbc.query("""select account_id from notifications.telegram_link
            where token_hash = ? and expires_at > now() for update""",
            { row, _ -> row.getObject(1, UUID::class.java) }, tokenHash(token)).singleOrNull() ?: return false
        val occupied = jdbc.queryForObject("select exists(select 1 from notifications.telegram_link where chat_id = ? and account_id <> ?)",
            Boolean::class.java, chatId, accountId)!!
        if (occupied) return false
        unlink(accountId)
        jdbc.update("update notifications.telegram_link set chat_id = ?, linked_at = now() where account_id = ?", chatId, accountId)
        return true
    }

    fun accountForChat(chatId: Long): UUID? = jdbc.query("select account_id from notifications.telegram_link where chat_id = ?",
        { row, _ -> row.getObject(1, UUID::class.java) }, chatId).singleOrNull()
}

@RestController
@RequestMapping("/api/v1/notifications/telegram")
class TelegramController(private val account: CurrentAccount, private val links: TelegramLinks) {
    @GetMapping fun status() = links.status(account.id())
    @PostMapping("/link") fun link() = links.create(account.id())
    @PostMapping("/unlink") fun unlink(): TelegramStatus {
        links.unlink(account.id())
        return links.status(account.id())
    }
}
