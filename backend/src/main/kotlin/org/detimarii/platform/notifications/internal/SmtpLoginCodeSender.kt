package org.detimarii.platform.notifications.internal

import org.detimarii.platform.identity.LoginCodeDeliveryUnavailable
import org.detimarii.platform.identity.LoginCodeSender
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.MailException
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.stereotype.Component

@Component
class SmtpLoginCodeSender(
    private val mail: JavaMailSender,
    @Value("\${platform.mail.enabled:false}") private val enabled: Boolean,
    @Value("\${platform.mail.from}") private val from: String,
) : LoginCodeSender {
    override fun send(email: String, code: String) {
        if (!enabled) throw LoginCodeDeliveryUnavailable()
        val message = SimpleMailMessage().apply {
            setFrom(from)
            setTo(email)
            subject = "Код входа — Дети Марии"
            text = "Код для входа: $code\n\nОн действует 5 минут. Никому не сообщайте код. Если вы не входили в кабинет, проигнорируйте письмо."
        }
        try {
            mail.send(message)
        } catch (_: MailException) {
            // Do not expose SMTP credentials, message contents or recipient details in errors/logs.
            throw LoginCodeDeliveryUnavailable()
        }
    }
}
