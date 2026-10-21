package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.detimarii.platform.identity.LoginCodeSender
import org.detimarii.platform.identity.LoginCodeDeliveryUnavailable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpSession
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.Callable
import java.util.concurrent.TimeUnit

@SpringBootTest(properties = ["POSTGRES_PASSWORD=testcontainers", "platform.auth.requests-per-minute=1000"])
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration::class, StaffAccessIntegrationTests.Config::class)
class StaffAccessIntegrationTests @Autowired constructor(
    private val mvc: MockMvc, private val json: ObjectMapper, private val jdbc: JdbcTemplate,
    private val mail: TestMail, private val clock: TestClock,
) {
    private val password = "synthetic staff test passphrase"
    private data class Person(val id: UUID, val email: String, val session: MockHttpSession)
    private data class Csrf(val header: String, val token: String)

    @BeforeEach
    fun resetClock() { clock.now = Instant.parse("2026-10-21T12:00:00Z") }

    @Test
    fun `password alone cannot read profiles and code completes a session with fresh CSRF`() {
        val person = person(staff = true)
        val login = login(person)
        assertThat(login.response.status).isEqualTo(202)
        assertThat(tree(login)["verificationRequired"].asBoolean()).isTrue()
        assertThat(tree(login).has("account")).isFalse()
        val anonymous = tree(get(person, "/auth/session"))
        assertThat(anonymous["account"].isNull).isTrue()
        assertThat(anonymous["verification"]["expiresAt"].asString()).isNotBlank()
        assertThat(get(person, "/coordination/volunteers").response.status).isEqualTo(401)
        val token = csrf(person.session)
        val before = person.session.id
        assertThat(verify(person, mail.codes.getValue(person.email), token).response.status).isEqualTo(200)
        assertThat(person.session.id).isNotEqualTo(before)
        assertThat(get(person, "/coordination/volunteers").response.status).isEqualTo(200)
        assertThat(post(person, "/auth/email-code/resend", emptyMap(), token).response.status).isEqualTo(403)
        assertThat(tree(get(person, "/auth/session"))["account"]["email"].asString()).isEqualTo(person.email)
    }

    @Test
    fun `codes are bound to one browser limited to five guesses and expire`() {
        val person = person(staff = true)
        login(person)
        val code = mail.codes.getValue(person.email)
        val wrong = if (code == "000000") "111111" else "000000"
        val otherBrowser = person.copy(session = MockHttpSession())
        assertThat(verify(otherBrowser, code).response.status).isEqualTo(401)
        repeat(5) { assertThat(verify(person, wrong).response.status).isEqualTo(401) }
        assertThat(verify(person, code).response.status).isEqualTo(401)
        clock.now = clock.now.plusSeconds(61)
        assertThat(login(person).response.status).isEqualTo(202)
        clock.now = clock.now.plusSeconds(301)
        assertThat(verify(person, mail.codes.getValue(person.email)).response.status).isEqualTo(401)
        assertThat(get(person, "/coordination/volunteers").response.status).isEqualTo(401)
    }

    @Test
    fun `resend invalidates the old code and cooldown also covers another browser`() {
        val person = person(staff = true)
        login(person)
        val first = mail.codes.getValue(person.email)
        assertThat(post(person, "/auth/email-code/resend").response.status).isEqualTo(429)
        val other = person.copy(session = MockHttpSession())
        assertThat(login(other).response.status).isEqualTo(429)
        clock.now = clock.now.plusSeconds(61)
        assertThat(post(person, "/auth/email-code/resend").response.status).isEqualTo(200)
        assertThat(verify(person, first).response.status).isEqualTo(401)
        assertThat(verify(person, mail.codes.getValue(person.email)).response.status).isEqualTo(200)
    }

    @Test
    fun `concurrent code verification succeeds only once`() {
        val person = person(staff = true)
        login(person)
        val token = csrf(person.session)
        val code = mail.codes.getValue(person.email)
        val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { executor ->
            val tasks = (1..2).map { executor.submit(Callable {
                gate.await(5, TimeUnit.SECONDS)
                verify(person, code, token).response.status
            }) }
            gate.countDown()
            val statuses = tasks.map { it.get(10, TimeUnit.SECONDS) }
            assertThat(statuses.count { it == 200 }).isEqualTo(1)
            assertThat(statuses.single { it != 200 }).isIn(401, 403)
        }
    }

    @Test
    fun `SMTP failure never grants access or creates a challenge`() {
        val person = person(staff = true)
        mail.failFor.add(person.email)
        assertThat(login(person).response.status).isEqualTo(503)
        val session = tree(get(person, "/auth/session"))
        assertThat(session["account"].isNull).isTrue()
        assertThat(session["verification"].isNull).isTrue()
        assertThat(get(person, "/coordination/volunteers").response.status).isEqualTo(401)
        assertThat(verify(person, "000000").response.status).isEqualTo(401)
    }

    @Test
    fun `changing rights revokes an existing session and an unfinished login`() {
        val staff = person(staff = true)
        login(staff)
        assertThat(verify(staff, mail.codes.getValue(staff.email)).response.status).isEqualTo(200)
        jdbc.update("update identity.account set security_version = security_version + 1 where id = ?", staff.id)
        assertThat(get(staff, "/coordination/volunteers").response.status).isEqualTo(401)
        assertThat(staff.session.isInvalid).isTrue()

        val pending = person(staff = true)
        login(pending)
        jdbc.update("delete from identity.account_role where account_id = ? and role = 'COORDINATOR'", pending.id)
        assertThat(verify(pending, mail.codes.getValue(pending.email)).response.status).isEqualTo(401)

        val volunteer = person()
        login(volunteer)
        jdbc.update("insert into identity.account_role values (?, 'COORDINATOR')", volunteer.id)
        assertThat(get(volunteer, "/coordination/volunteers").response.status).isEqualTo(401)
    }

    @Test
    fun `coordinator reads paginated filtered profiles through module API but cannot edit them`() {
        val prefix = UUID.randomUUID().toString()
        val volunteer = person()
        login(volunteer)
        val first = save(volunteer, "$prefix Анна", "REGULAR")
        val second = person()
        login(second)
        save(second, "$prefix Борис", "ONE_OFF")
        assertThat(get(volunteer, "/coordination/volunteers").response.status).isEqualTo(403)
        assertThat(get(volunteer, "/coordination/volunteers/$first").response.status).isEqualTo(403)

        val staff = person(staff = true)
        login(staff)
        verify(staff, mail.codes.getValue(staff.email))
        val page = tree(get(staff, "/coordination/volunteers?q=$prefix&size=1"))
        assertThat(page["total"].asLong()).isEqualTo(2)
        assertThat(page["items"].size()).isEqualTo(1)
        val next = tree(get(staff, "/coordination/volunteers?q=$prefix&size=1&page=1"))
        assertThat(next["items"][0]["id"]).isNotEqualTo(page["items"][0]["id"])
        val filtered = tree(get(staff, "/coordination/volunteers?q=$prefix&regularity=REGULAR"))
        assertThat(filtered["total"].asLong()).isEqualTo(1)
        assertThat(filtered["items"][0]["id"].asString()).isEqualTo(first)
        val card = tree(get(staff, "/coordination/volunteers/$first"))
        assertThat(card["email"].asString()).isEqualTo(volunteer.email)
        assertThat(card["interests"].asString()).isEqualTo("Рисование")
        assertThat(card.has("accountId")).isFalse()
        assertThat(card.has("passwordHash")).isFalse()
        assertThat(get(staff, "/coordination/volunteers/${UUID.randomUUID()}").response.status).isEqualTo(404)
        assertThat(get(staff, "/coordination/volunteers?size=101").response.status).isEqualTo(400)
        assertThat(get(staff, "/coordination/volunteers?page=-1").response.status).isEqualTo(400)
        assertThat(get(staff, "/coordination/volunteers?regularity=INVALID").response.status).isEqualTo(400)
        val token = csrf(staff.session)
        assertThat(mvc.perform(put("/api/v1/coordination/volunteers/$first").session(staff.session)
            .header(token.header, token.token).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().response.status).isEqualTo(403)
    }

    @Test
    fun `review publishes only the owners next step and preserves private history with the server author`() {
        val owner = person()
        login(owner)
        val id = save(owner, "Анна", "REGULAR")
        val other = person()
        login(other)
        assertThat(get(other, "/onboarding/me").response.status).isEqualTo(404)
        save(other, "Другая анкета", "UNSURE")
        val staff = signedStaff()
        val path = "/coordination/volunteers/$id/review"
        assertThat(tree(get(staff, path))["current"]["version"].asLong()).isZero()
        assertThat(jdbc.queryForObject("select count(*) from onboarding.review where volunteer_id = ?", Long::class.java, UUID.fromString(id))).isZero()
        val fields = reviewFields()
        val saved = reviewPut(staff, id, 0, fields)
        assertThat(saved.response.status).isEqualTo(200)
        val current = tree(saved)["current"]
        assertThat(current["version"].asLong()).isEqualTo(1)
        assertThat(current["actorId"].asString()).isEqualTo(staff.id.toString())
        assertThat(current["actorEmail"].asString()).isEqualTo(staff.email)
        assertThat(current["updatedAt"].asString()).isNotBlank()
        val own = get(owner, "/onboarding/me")
        val view = tree(own)
        assertThat(view["status"].asString()).isEqualTo("CONTINUE")
        assertThat(view["message"].asString()).isEqualTo("Рады познакомиться!")
        assertThat(view["nextStepOwner"].asString()).isEqualTo("COORDINATOR")
        assertThat(view["nextStepDate"].asString()).isEqualTo("2026-11-03")
        assertThat(own.response.contentAsString).doesNotContain("internalNote", "Служебная заметка", "actorId", "actorEmail", staff.email, "version", "history")
        assertThat(tree(get(other, "/onboarding/me"))["status"].asString()).isEqualTo("NEW")
        assertThat(get(other, "/onboarding/$id").response.status).isEqualTo(403)

        val changed = reviewPut(staff, id, 1, fields + ("internalNote" to "Уточнённая служебная заметка"))
        assertThat(changed.response.status).isEqualTo(200)
        val history = tree(changed)["history"]
        assertThat(history.size()).isEqualTo(2)
        assertThat(history[0]["version"].asLong()).isEqualTo(2)
        assertThat(history[1]["fields"]["internalNote"].asString()).isEqualTo("Служебная заметка")
        assertThat(get(owner, "/onboarding/me").response.contentAsString).doesNotContain("служебная", "Служебная")
    }

    @Test
    fun `review writes require verified coordinator and CSRF and never edit the volunteer profile`() {
        val owner = person()
        login(owner)
        val id = save(owner, "Имя владельца", "REGULAR")
        val before = get(owner, "/volunteers/me").response.contentAsString
        val path = "/coordination/volunteers/$id/review"
        assertThat(get(owner, path).response.status).isEqualTo(403)
        assertThat(reviewPut(owner, id, 0, reviewFields()).response.status).isEqualTo(403)
        val pending = person(staff = true)
        login(pending)
        assertThat(reviewPut(pending, id, 0, reviewFields()).response.status).isEqualTo(401)
        verify(pending, mail.codes.getValue(pending.email))
        assertThat(mvc.perform(put("/api/v1$path").session(pending.session)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(mapOf("version" to 0, "fields" to reviewFields()))))
            .andReturn().response.status).isEqualTo(403)
        assertThat(reviewPut(pending, id, 0, reviewFields()).response.status).isEqualTo(200)
        assertThat(get(owner, "/volunteers/me").response.contentAsString).isEqualTo(before)
        assertThat(reviewPut(pending, UUID.randomUUID().toString(), 0, reviewFields()).response.status).isEqualTo(404)
        assertThat(get(pending, "/coordination/volunteers/${UUID.randomUUID()}/review").response.status).isEqualTo(404)
    }

    @Test
    fun `review validates message and next step pairs without leaving partial records`() {
        val owner = person()
        login(owner)
        val id = save(owner, "Проверка полей", "REGULAR")
        val staff = signedStaff()
        val invalid = listOf(
            reviewFields() + ("message" to "   "), reviewFields() + ("message" to "x".repeat(2001)),
            reviewFields() + ("status" to "ADMITTED"), reviewFields() + ("internalNote" to "x".repeat(4001)),
            reviewFields() + ("nextStepOwner" to null), reviewFields() + ("nextStep" to " "),
            reviewFields() + ("nextStepDate" to "2026-02-30"),
        )
        invalid.forEach { assertThat(reviewPut(staff, id, 0, it).response.status).isEqualTo(400) }
        assertThat(reviewPut(staff, id, -1, reviewFields()).response.status).isEqualTo(400)
        assertThat(tree(get(staff, "/coordination/volunteers/$id/review"))["history"].size()).isZero()
        // A decision may have a message without an action or a date; there is no forced linear funnel.
        val paused = reviewFields() + mapOf("status" to "PAUSED", "nextStep" to "", "nextStepOwner" to null, "nextStepDate" to null)
        assertThat(reviewPut(staff, id, 0, paused).response.status).isEqualTo(200)
    }

    @Test
    fun `concurrent first reviews and stale updates preserve one revision while identical retry is idempotent`() {
        val owner = person()
        login(owner)
        val id = save(owner, "Параллельные решения", "REGULAR")
        val staff = signedStaff()
        val token = csrf(staff.session)
        val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { executor ->
            val tasks = (1..2).map { number -> executor.submit(Callable {
                gate.await(5, TimeUnit.SECONDS)
                reviewPut(staff, id, 0, reviewFields() + ("message" to "Сообщение $number"), token).response.status
            }) }
            gate.countDown()
            assertThat(tasks.map { it.get(10, TimeUnit.SECONDS) }).containsExactlyInAnyOrder(200, 409)
        }
        val path = "/coordination/volunteers/$id/review"
        val first = tree(get(staff, path))
        assertThat(first["history"].size()).isEqualTo(1)
        val originalFields = reviewFields() + ("message" to first["current"]["fields"]["message"].asString())
        val retry = reviewPut(staff, id, 0, originalFields)
        assertThat(retry.response.status).isEqualTo(200)
        assertThat(tree(retry)).isEqualTo(first)
        assertThat(reviewPut(staff, id, 1, reviewFields()).response.status).isEqualTo(200)
        assertThat(reviewPut(staff, id, 1, reviewFields() + ("message" to "Устаревшая правка")).response.status).isEqualTo(409)
        val latest = tree(get(staff, path))
        assertThat(latest["history"].size()).isEqualTo(2)
        assertThat(latest["current"]["fields"]["message"].asString()).isEqualTo("Рады познакомиться!")
    }

    private fun signedStaff(): Person = person(staff = true).also {
        check(login(it).response.status == 202)
        check(verify(it, mail.codes.getValue(it.email)).response.status == 200)
    }

    private fun reviewFields(): Map<String, Any?> = mapOf(
        "status" to "CONTINUE", "message" to "Рады познакомиться!", "nextStep" to "Договориться о звонке",
        "nextStepOwner" to "COORDINATOR", "nextStepDate" to "2026-11-03", "internalNote" to "Служебная заметка",
    )

    private fun reviewPut(person: Person, id: String, version: Long, fields: Map<String, Any?>, token: Csrf = csrf(person.session)) =
        mvc.perform(put("/api/v1/coordination/volunteers/$id/review").session(person.session)
            .header(token.header, token.token).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(mapOf("version" to version, "fields" to fields)))).andReturn()

    private fun person(staff: Boolean = false): Person {
        val email = "staff-test-${UUID.randomUUID()}@example.org"
        val result = post(Person(UUID.randomUUID(), email, MockHttpSession()), "/auth/register", mapOf("email" to email, "password" to password))
        check(result.response.status == 201)
        val id = UUID.fromString(tree(result)["id"].asString())
        if (staff) jdbc.update("insert into identity.account_role values (?, 'COORDINATOR')", id)
        return Person(id, email, MockHttpSession())
    }

    private fun login(person: Person) = post(person, "/auth/login", mapOf("email" to person.email, "password" to password))
    private fun verify(person: Person, code: String, token: Csrf = csrf(person.session)) = post(person, "/auth/email-code/verify", mapOf("code" to code), token)
    private fun get(person: Person, path: String) = mvc.perform(get("/api/v1$path").session(person.session)).andReturn()
    private fun post(person: Person, path: String, body: Map<String, Any> = emptyMap(), token: Csrf = csrf(person.session)): MvcResult =
        mvc.perform(post("/api/v1$path").session(person.session).header(token.header, token.token)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))).andReturn()

    private fun csrf(session: MockHttpSession): Csrf {
        val result = mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn()
        check(result.response.status == 200)
        return Csrf(tree(result)["headerName"].asString(), tree(result)["token"].asString())
    }

    private fun save(person: Person, name: String, regularity: String): String {
        val token = csrf(person.session)
        val result = mvc.perform(put("/api/v1/volunteers/me").session(person.session).header(token.header, token.token)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(mapOf(
                "displayName" to name, "regularity" to regularity, "interests" to "Рисование",
            )))).andReturn()
        check(result.response.status == 200)
        return tree(result)["id"].asString()
    }

    private fun tree(result: MvcResult) = json.readTree(result.response.contentAsString)

    class TestClock : Clock() {
        var now: Instant = Instant.parse("2026-10-21T12:00:00Z")
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = now
    }

    class TestMail : LoginCodeSender {
        val codes = ConcurrentHashMap<String, String>()
        val failFor = ConcurrentHashMap.newKeySet<String>()
        override fun send(email: String, code: String) {
            if (email in failFor) throw LoginCodeDeliveryUnavailable()
            codes[email] = code
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    class Config {
        @Bean @Primary fun testClock() = TestClock()
        @Bean @Primary fun testMail() = TestMail()
    }
}
