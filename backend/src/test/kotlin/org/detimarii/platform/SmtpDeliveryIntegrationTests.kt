package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.detimarii.platform.identity.LoginCodeDeliveryUnavailable
import org.detimarii.platform.notifications.internal.SmtpLoginCodeSender
import org.junit.jupiter.api.Test
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.utility.DockerImageName
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

class SmtpDeliveryIntegrationTests {
    private class Mailpit : GenericContainer<Mailpit>(DockerImageName.parse("axllent/mailpit:v1.27.4"))

    @Test
    fun `SMTP adapter delivers a UTF-8 code only to an isolated mail sandbox`() {
        Mailpit().withExposedPorts(1025, 8025).waitingFor(Wait.forHttp("/livez").forPort(8025)).use { sandbox ->
            sandbox.start()
            val transport = JavaMailSenderImpl().apply {
                host = sandbox.host
                port = sandbox.getMappedPort(1025)
                defaultEncoding = "UTF-8"
                javaMailProperties["mail.smtp.connectiontimeout"] = "5000"
                javaMailProperties["mail.smtp.timeout"] = "5000"
                javaMailProperties["mail.smtp.writetimeout"] = "5000"
            }
            val sender = SmtpLoginCodeSender(transport, true, "noreply@example.test")
            sender.send("isolated-recipient@example.test", "123456")
            HttpClient.newHttpClient().use { client ->
                val response = client.send(
                    HttpRequest.newBuilder(URI("http://${sandbox.host}:${sandbox.getMappedPort(8025)}/api/v1/message/latest"))
                        .timeout(Duration.ofSeconds(5)).GET().build(),
                    HttpResponse.BodyHandlers.ofString(),
                )
                assertThat(response.statusCode()).isEqualTo(200)
                assertThat(response.body()).contains("isolated-recipient@example.test", "Код входа — Дети Марии", "123456")
            }
        }
    }

    @Test
    fun `disabled email delivery fails closed without contacting SMTP`() {
        val sender = SmtpLoginCodeSender(JavaMailSenderImpl(), false, "noreply@example.test")
        assertThatThrownBy { sender.send("unused@example.test", "123456") }
            .isInstanceOf(LoginCodeDeliveryUnavailable::class.java)
    }
}
