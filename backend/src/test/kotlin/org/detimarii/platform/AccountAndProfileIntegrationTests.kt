package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(properties = ["POSTGRES_PASSWORD=testcontainers", "platform.auth.requests-per-minute=1000"])
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration::class)
class AccountAndProfileIntegrationTests @Autowired constructor(
    private val mvc: MockMvc,
    private val json: ObjectMapper,
    private val jdbc: JdbcTemplate,
    private val passwords: PasswordEncoder,
) {
    private val password = "a long synthetic test passphrase"
    private data class Client(val session: MockHttpSession, val header: String, val token: String)
    private data class SignedIn(val client: Client, val id: UUID, val email: String)

    @Test
    fun `registration assigns only volunteer role normalizes email and stores a salted password hash`() {
        val client = csrf()
        val email = "Person-${UUID.randomUUID()}@Example.org"
        val body = mapOf("email" to email, "password" to password, "roles" to listOf("ADMIN", "COORDINATOR"))
        val result = authPost("register", client, body)
        assertThat(result.response.status).isEqualTo(201)
        val account = tree(result)
        assertThat(account["email"].asString()).isEqualTo(email.lowercase())
        assertThat(account["roles"]).isEqualTo(json.readTree("[\"VOLUNTEER\"]"))
        assertThat(account.has("password")).isFalse()
        assertThat(account.has("passwordHash")).isFalse()
        val storedHash = jdbc.queryForObject(
            "select password_hash from identity.account where id = ?", String::class.java,
            UUID.fromString(account["id"].asString()),
        )!!
        assertThat(storedHash).startsWith("{pbkdf2-sha256-v1}").doesNotContain(password)
        assertThat(passwords.matches(password, storedHash)).isTrue()
        assertThat(authPost("register", client, body + ("email" to email.lowercase())).response.status).isEqualTo(409)
        assertThat(tree(mvc.perform(get("/api/v1/auth/session").session(client.session)).andReturn())["account"].isNull).isTrue()
    }

    @Test
    fun `registration and login require CSRF and reject weak passwords`() {
        val credentials = mapOf("email" to email(), "password" to password)
        for (route in listOf("register", "login")) {
            mvc.perform(post("/api/v1/auth/$route").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(credentials))).andExpect(status().isForbidden)
        }
        assertThat(authPost("register", csrf(), credentials + ("password" to "short")).response.status).isEqualTo(400)
    }

    @Test
    fun `login rotates the session and CSRF token and persists the authenticated account`() {
        val client = csrf()
        val email = email()
        assertThat(authPost("register", client, mapOf("email" to email, "password" to password)).response.status).isEqualTo(201)
        val originalId = client.session.id
        assertThat(authPost("login", client, mapOf("email" to email.uppercase(), "password" to password)).response.status).isEqualTo(200)
        assertThat(client.session.id).isNotEqualTo(originalId)
        val session = mvc.perform(get("/api/v1/auth/session").session(client.session)).andReturn()
        assertThat(tree(session)["account"]["email"].asString()).isEqualTo(email)
        assertThat(save(client, profile()).response.status).isEqualTo(403)
        val refreshed = csrf(client.session)
        assertThat(save(refreshed, profile()).response.status).isEqualTo(200)
        assertThat(session.response.getHeader("Cache-Control")).contains("no-store")
    }

    @Test
    fun `unknown account and incorrect password produce the same login error`() {
        val user = signedIn()
        val badPassword = authPost("login", csrf(), mapOf("email" to user.email, "password" to "incorrect password"))
        val unknown = authPost("login", csrf(), mapOf("email" to email(), "password" to "incorrect password"))
        assertThat(badPassword.response.status).isEqualTo(401)
        assertThat(unknown.response.status).isEqualTo(401)
        assertThat(tree(badPassword)["detail"].asString()).isEqualTo(tree(unknown)["detail"].asString())
    }

    @Test
    fun `logout requires CSRF and invalidates the session`() {
        val user = signedIn()
        mvc.perform(post("/api/v1/auth/logout").session(user.client.session)).andExpect(status().isForbidden)
        mvc.perform(post("/api/v1/auth/logout").session(user.client.session)
            .header(user.client.header, user.client.token)).andExpect(status().isNoContent)
        assertThat(user.client.session.isInvalid).isTrue()
        mvc.perform(get("/api/v1/volunteers/me")).andExpect(status().isUnauthorized)
        assertThat(tree(mvc.perform(get("/api/v1/auth/session")).andReturn())["account"].isNull).isTrue()
    }

    @Test
    fun `profile can be saved retrieved and edited after another login`() {
        val user = signedIn()
        mvc.perform(get("/api/v1/volunteers/me").session(user.client.session)).andExpect(status().isNotFound)
        val initial = save(user.client, profile("  Аня  "))
        assertThat(initial.response.status).isEqualTo(200)
        assertThat(tree(initial)["displayName"].asString()).isEqualTo("Аня")
        val again = signIn(user.email)
        val restored = tree(mvc.perform(get("/api/v1/volunteers/me").session(again.session)).andReturn())
        assertThat(restored["id"].asString()).isEqualTo(tree(initial)["id"].asString())
        val edited = save(again, profile("Анна", restored["version"].asLong()))
        assertThat(edited.response.status).isEqualTo(200)
        assertThat(tree(edited)["version"].asLong()).isEqualTo(1)
    }

    @Test
    fun `profile ownership comes from the session and foreign routes remain inaccessible`() {
        val first = signedIn()
        val second = signedIn()
        val firstProfile = tree(save(first.client, profile("Первый волонтёр")))
        val malicious = profile("Второй волонтёр") + mapOf("accountId" to first.id, "id" to firstProfile["id"].asString())
        assertThat(save(second.client, malicious).response.status).isEqualTo(200)
        val own = tree(mvc.perform(get("/api/v1/volunteers/me").session(first.client.session)).andReturn())
        assertThat(own["displayName"].asString()).isEqualTo("Первый волонтёр")
        mvc.perform(get("/api/v1/volunteers/${firstProfile["id"].asString()}").session(second.client.session))
            .andExpect(status().isForbidden)
        mvc.perform(get("/api/v1/volunteers").session(second.client.session)).andExpect(status().isForbidden)
        assertThat(jdbc.queryForObject("select count(*) from volunteers.volunteer_profile where account_id = ?",
            Int::class.java, second.id)).isEqualTo(1)
    }

    @Test
    fun `profile access requires the volunteer role and validates input`() {
        val user = signedIn()
        assertThat(save(user.client, profile("   ")).response.status).isEqualTo(400)
        assertThat(save(user.client, profile() + ("skills" to "x".repeat(1001))).response.status).isEqualTo(400)
        jdbc.update("delete from identity.account_role where account_id = ?", user.id)
        jdbc.update("insert into identity.account_role (account_id, role) values (?, 'COORDINATOR')", user.id)
        val coordinatorOnly = signIn(user.email)
        mvc.perform(get("/api/v1/volunteers/me").session(coordinatorOnly.session)).andExpect(status().isForbidden)
        mvc.perform(get("/api/v1/coordination").session(coordinatorOnly.session)).andExpect(status().isForbidden)
    }

    @Test
    fun `identical retries preserve one profile and stale edits cannot overwrite newer data`() {
        val user = signedIn()
        val first = save(user.client, profile())
        val retry = save(user.client, profile())
        assertThat(tree(retry)).isEqualTo(tree(first))
        val updated = save(user.client, profile("Новое имя", 0))
        assertThat(updated.response.status).isEqualTo(200)
        assertThat(tree(save(user.client, profile("Новое имя", 0)))).isEqualTo(tree(updated))
        assertThat(save(user.client, profile("Устаревшее изменение", 0)).response.status).isEqualTo(409)
        assertThat(tree(mvc.perform(get("/api/v1/volunteers/me").session(user.client.session)).andReturn())["displayName"].asString())
            .isEqualTo("Новое имя")
    }

    @Test
    fun `concurrent first saves of the same profile produce a single record`() {
        val user = signedIn()
        val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { executor ->
            val requests = (1..2).map {
                executor.submit(Callable { gate.await(5, TimeUnit.SECONDS); save(user.client, profile()) })
            }
            gate.countDown()
            val results = requests.map { it.get(10, TimeUnit.SECONDS) }
            assertThat(results.map { it.response.status }).containsOnly(200)
            assertThat(tree(results[0])["id"]).isEqualTo(tree(results[1])["id"])
            assertThat(jdbc.queryForObject("select count(*) from volunteers.volunteer_profile where account_id = ?",
                Int::class.java, user.id)).isEqualTo(1)
        }
    }

    private fun csrf(session: MockHttpSession? = null): Client {
        val request = get("/api/v1/auth/csrf")
        if (session != null) request.session(session)
        val result = mvc.perform(request).andExpect(status().isOk).andReturn()
        val body = tree(result)
        return Client(result.request.getSession(false) as MockHttpSession, body["headerName"].asString(), body["token"].asString())
    }

    private fun signedIn(): SignedIn {
        val email = email()
        val registered = authPost("register", csrf(), mapOf("email" to email, "password" to password))
        check(registered.response.status == 201) { registered.response.contentAsString }
        return SignedIn(signIn(email), UUID.fromString(tree(registered)["id"].asString()), email)
    }

    private fun signIn(email: String): Client {
        val client = csrf()
        val result = authPost("login", client, mapOf("email" to email, "password" to password))
        check(result.response.status == 200) { result.response.contentAsString }
        return csrf(client.session)
    }

    private fun authPost(route: String, client: Client, body: Map<String, Any?>): MvcResult = mvc.perform(
        post("/api/v1/auth/$route").session(client.session).header(client.header, client.token)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)),
    ).andReturn()

    private fun save(client: Client, body: Map<String, Any?>): MvcResult = mvc.perform(
        put("/api/v1/volunteers/me").session(client.session).header(client.header, client.token)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)),
    ).andReturn()

    private fun profile(name: String = "Анна", version: Long? = null): Map<String, Any?> = mapOf(
        "displayName" to name, "interests" to "Рисование", "skills" to "Фотография",
        "availability" to "По субботам", "regularity" to "REGULAR", "version" to version,
    )

    private fun tree(result: MvcResult): JsonNode = json.readTree(result.response.contentAsString)
    private fun email(): String = "volunteer-${UUID.randomUUID()}@example.org"
}
