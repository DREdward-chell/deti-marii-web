package org.detimarii.platform.notifications.internal.telegram

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import java.net.URI

@ConfigurationProperties("platform.telegram")
data class TelegramProperties(
    val enabled: Boolean = false,
    val token: String = "",
    val username: String = "",
    val siteUrl: String = "http://localhost:8088",
) {
    init {
        if (enabled) {
            require(token.matches(Regex("[0-9]+:[A-Za-z0-9_-]+"))) { "Configure TELEGRAM_BOT_TOKEN" }
            require(username.matches(Regex("[A-Za-z0-9_]{5,32}"))) { "Configure TELEGRAM_BOT_USERNAME without @" }
            val uri = URI(siteUrl)
            require(uri.scheme in setOf("http", "https") && uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null) {
                "Configure TELEGRAM_SITE_URL as the public site origin"
            }
        }
    }
    // Configuration objects must not expose the token through logs/debug strings.
    override fun toString() = "TelegramProperties(enabled=$enabled)"
}

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TelegramProperties::class)
@EnableScheduling
class TelegramConfiguration
