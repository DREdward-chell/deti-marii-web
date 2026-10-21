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
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(properties = ["POSTGRES_PASSWORD=testcontainers", "platform.auth.requests-per-minute=1000"])
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration::class, StaffAccessIntegrationTests.Config::class)
class ClearanceIntegrationTests @Autowired constructor(
    private val mvc: MockMvc, private val json: ObjectMapper, private val jdbc: JdbcTemplate,
    private val mail: StaffAccessIntegrationTests.TestMail,
) {
    private data class Person(val id: UUID, val email: String, val session: MockHttpSession)
    private val password = "synthetic clearance test passphrase"

    @Test
    fun `paperwork role admission and application review remain independent with private staff history`() {
        val staff = person(staff = true)
        val owner = person()
        val id = profile(owner)
        val roleId = role(staff)
        val paperwork = "/coordination/volunteers/$id/paperwork"
        val admission = "/coordination/volunteers/$id/admissions/$roleId"
        assertThat(tree(read(staff, paperwork))["current"]["version"].asLong()).isZero()
        assertThat(tree(read(staff, admission))["current"]["fields"]["status"].asString()).isEqualTo("NOT_GRANTED")
        assertThat(jdbc.queryForObject("select count(*) from onboarding.paperwork where volunteer_id = ?", Long::class.java, UUID.fromString(id))).isZero()
        assertThat(jdbc.queryForObject("select count(*) from onboarding.role_admission where volunteer_id = ?", Long::class.java, UUID.fromString(id))).isZero()

        val grant = write(staff, admission, decision("GRANTED"))
        assertThat(grant.response.status).isEqualTo(200)
        assertThat(tree(grant)["current"]["actorId"].asString()).isEqualTo(staff.id.toString())
        assertThat(tree(grant)["current"]["actorEmail"].asString()).isEqualTo(staff.email)
        var own = read(owner, "/onboarding/me/clearance")
        assertThat(tree(own)["paperwork"]["status"].asString()).isEqualTo("NOT_CONFIRMED")
        assertThat(tree(own)["admissions"][0]["status"].asString()).isEqualTo("GRANTED")
        assertThat(own.response.contentAsString).doesNotContain("internalNote", "Внутреннее основание", "actorId", "actorEmail", staff.email, "history")
        assertThat(tree(read(owner, "/onboarding/me"))["status"].asString()).isEqualTo("NEW")
        assertThat(write(staff, paperwork, decision("CONFIRMED")).response.status).isEqualTo(200)
        own = read(owner, "/onboarding/me/clearance")
        assertThat(tree(own)["paperwork"]["status"].asString()).isEqualTo("CONFIRMED")
        assertThat(tree(own)["admissions"].size()).isEqualTo(1)

        val other = person()
        assertThat(read(other, "/onboarding/me/clearance").response.status).isEqualTo(404)
        profile(other)
        val otherView = tree(read(other, "/onboarding/me/clearance"))
        assertThat(otherView["admissions"].size()).isZero()
        assertThat(otherView["paperwork"]["status"].asString()).isEqualTo("NOT_CONFIRMED")
        assertThat(read(other, "/onboarding/$id/clearance").response.status).isEqualTo(403)
        // Domain admissions cannot grant access to staff APIs or change identity roles.
        assertThat(read(owner, "/coordination/volunteer-roles").response.status).isEqualTo(403)
        assertThat(tree(read(owner, "/auth/session"))["account"]["roles"].toString()).isEqualTo("[\"VOLUNTEER\"]")
    }

    @Test
    fun `suspension revocation and paperwork recheck are immediately visible in the same volunteer session`() {
        val staff = person(staff = true)
        val owner = person()
        val id = profile(owner)
        val roleId = role(staff)
        val paperwork = "/coordination/volunteers/$id/paperwork"
        val admission = "/coordination/volunteers/$id/admissions/$roleId"
        write(staff, paperwork, decision("CONFIRMED"))
        write(staff, admission, decision("GRANTED"))
        assertThat(write(staff, paperwork, decision("NEEDS_UPDATE", 1, "Уточним оформление.")).response.status).isEqualTo(200)
        assertThat(tree(read(owner, "/onboarding/me/clearance"))["paperwork"]["status"].asString()).isEqualTo("NEEDS_UPDATE")
        listOf("SUSPENDED", "REVOKED", "GRANTED").forEachIndexed { index, status ->
            assertThat(write(staff, admission, decision(status, index + 1L, "Решение: $status")).response.status).isEqualTo(200)
            assertThat(tree(read(owner, "/onboarding/me/clearance"))["admissions"][0]["status"].asString()).isEqualTo(status)
            assertThat(tree(read(owner, "/onboarding/me/clearance"))["paperwork"]["status"].asString()).isEqualTo("NEEDS_UPDATE")
        }
        val history = tree(read(staff, admission))["history"]
        assertThat(history.size()).isEqualTo(4)
        assertThat(history[0]["fields"]["status"].asString()).isEqualTo("GRANTED")
        assertThat(history[1]["fields"]["status"].asString()).isEqualTo("REVOKED")
        assertThat(history[3]["fields"]["status"].asString()).isEqualTo("GRANTED")
    }

    @Test
    fun `clearance and catalog require verified staff and CSRF`() {
        val staff = person(staff = true)
        val owner = person()
        val id = profile(owner)
        val roleId = role(staff)
        val paths = listOf("/coordination/volunteers/$id/paperwork", "/coordination/volunteers/$id/admissions/$roleId")
        paths.forEach { path ->
            assertThat(read(owner, path).response.status).isEqualTo(403)
            assertThat(write(owner, path, decision("CONFIRMED")).response.status).isEqualTo(403)
            assertThat(mvc.perform(put("/api/v1$path").session(staff.session).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(decision("CONFIRMED")))) .andReturn().response.status).isEqualTo(403)
            assertThat(mvc.perform(get("/api/v1$path")).andReturn().response.status).isEqualTo(401)
        }
        assertThat(write(owner, "/coordination/volunteer-roles", mapOf("name" to "Нельзя"), create = true).response.status).isEqualTo(403)
        assertThat(write(owner, "/coordination/volunteer-roles/$roleId", mapOf("version" to 0, "fields" to mapOf("name" to "Нельзя"))).response.status).isEqualTo(403)
        assertThat(write(owner, "/onboarding/me/clearance", decision("CONFIRMED")).response.status).isEqualTo(403)
        val pending = person(staff = true, verify = false)
        assertThat(write(pending, paths[0], decision("CONFIRMED")).response.status).isEqualTo(401)
        assertThat(read(pending, "/coordination/volunteer-roles").response.status).isEqualTo(401)
    }

    @Test
    fun `invalid decisions and unknown profiles or roles never leave partial records`() {
        val staff = person(staff = true)
        val id = profile(person())
        val roleId = role(staff)
        val paperwork = "/coordination/volunteers/$id/paperwork"
        val admission = "/coordination/volunteers/$id/admissions/$roleId"
        listOf(paperwork to "CONFIRMED", admission to "GRANTED").forEach { (path, status) ->
            assertThat(write(staff, path, decision(status, message = "  ")).response.status).isEqualTo(400)
            assertThat(write(staff, path, decision(status, message = "x".repeat(2001))).response.status).isEqualTo(400)
            assertThat(write(staff, path, decision("INVALID")).response.status).isEqualTo(400)
            assertThat(write(staff, path, decision(status, -1)).response.status).isEqualTo(400)
            assertThat(tree(read(staff, path))["history"].size()).isZero()
        }
        assertThat(write(staff, "/coordination/volunteers/${UUID.randomUUID()}/paperwork", decision("CONFIRMED")).response.status).isEqualTo(404)
        assertThat(write(staff, "/coordination/volunteers/$id/admissions/${UUID.randomUUID()}", decision("GRANTED")).response.status).isEqualTo(404)
    }

    @Test
    fun `concurrent decisions keep one revision stale updates conflict and retries do not duplicate history`() {
        val staff = person(staff = true)
        val id = profile(person())
        val roleId = role(staff)
        listOf("/coordination/volunteers/$id/paperwork" to "CONFIRMED", "/coordination/volunteers/$id/admissions/$roleId" to "GRANTED")
            .forEach { (path, status) ->
                val token = csrf(staff.session)
                val gate = CountDownLatch(1)
                Executors.newFixedThreadPool(2).use { pool ->
                    val writes = (1..2).map { number -> pool.submit(Callable {
                        gate.await(5, TimeUnit.SECONDS)
                        write(staff, path, decision(status, message = "Решение $number"), token = token).response.status
                    }) }
                    gate.countDown()
                    assertThat(writes.map { it.get(10, TimeUnit.SECONDS) }).containsExactlyInAnyOrder(200, 409)
                }
                val first = tree(read(staff, path))
                assertThat(first["history"].size()).isEqualTo(1)
                val message = first["current"]["fields"]["message"].asString()
                val retry = write(staff, path, decision(status, message = " $message "))
                assertThat(retry.response.status).isEqualTo(200)
                assertThat(tree(retry)).isEqualTo(first)
                assertThat(write(staff, path, decision(status, 1, "Уточнённое решение")).response.status).isEqualTo(200)
                assertThat(write(staff, path, decision(status, 1, "Устаревший текст")).response.status).isEqualTo(409)
                assertThat(tree(read(staff, path))["history"].size()).isEqualTo(2)
            }
        // Each role and paperwork have independent versions.
        val secondRole = role(staff)
        assertThat(write(staff, "/coordination/volunteers/$id/admissions/$secondRole", decision("GRANTED")).response.status).isEqualTo(200)
    }

    @Test
    fun `role names are normalized unique editable with optimistic versions and audited without changing admissions`() {
        val staff = person(staff = true)
        val name = "Фотограф ${UUID.randomUUID()}"
        val created = write(staff, "/coordination/volunteer-roles", mapOf("name" to "  $name  ", "description" to " Съёмка "), create = true)
        assertThat(created.response.status).isEqualTo(201)
        val id = tree(created)["id"].asString()
        assertThat(tree(created)["name"].asString()).isEqualTo(name)
        assertThat(tree(created)["description"].asString()).isEqualTo("Съёмка")
        assertThat(write(staff, "/coordination/volunteer-roles", mapOf("name" to name.uppercase()), create = true).response.status).isEqualTo(409)
        assertThat(write(staff, "/coordination/volunteer-roles", mapOf("name" to "  "), create = true).response.status).isEqualTo(400)
        val volunteerId = profile(person())
        val admission = "/coordination/volunteers/$volunteerId/admissions/$id"
        write(staff, admission, decision("GRANTED"))
        val update = mapOf("version" to 0, "fields" to mapOf("name" to "$name (мероприятия)", "description" to "Новое описание"))
        assertThat(write(staff, "/coordination/volunteer-roles/$id", update).response.status).isEqualTo(200)
        assertThat(write(staff, "/coordination/volunteer-roles/$id", update).response.status).isEqualTo(200)
        assertThat(write(staff, "/coordination/volunteer-roles/$id", mapOf("version" to 0, "fields" to mapOf("name" to name))).response.status).isEqualTo(409)
        assertThat(jdbc.queryForObject("select count(*) from onboarding.volunteer_role_revision where role_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(2)
        assertThat(tree(read(staff, admission))["current"]["fields"]["status"].asString()).isEqualTo("GRANTED")
        // A unique-name failure must roll back both metadata and its audit.
        val otherName = "Другой вид ${UUID.randomUUID()}"
        role(staff, otherName)
        assertThat(write(staff, "/coordination/volunteer-roles/$id", mapOf("version" to 1, "fields" to mapOf("name" to otherName))).response.status).isEqualTo(409)
        assertThat(jdbc.queryForObject("select version from onboarding.volunteer_role where id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(1)
        assertThat(jdbc.queryForObject("select count(*) from onboarding.volunteer_role_revision where role_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(2)
    }

    private fun person(staff: Boolean = false, verify: Boolean = true): Person {
        val email = "clearance-${UUID.randomUUID()}@example.test"
        val anonymous = Person(UUID.randomUUID(), email, MockHttpSession())
        val registration = write(anonymous, "/auth/register", mapOf("email" to email, "password" to password), create = true)
        check(registration.response.status == 201)
        val id = UUID.fromString(tree(registration)["id"].asString())
        if (staff) jdbc.update("insert into identity.account_role values (?, 'COORDINATOR')", id)
        val person = Person(id, email, MockHttpSession())
        check(write(person, "/auth/login", mapOf("email" to email, "password" to password), create = true).response.status == if (staff) 202 else 200)
        if (staff && verify) check(write(person, "/auth/email-code/verify", mapOf("code" to mail.codes.getValue(email)), create = true).response.status == 200)
        return person
    }
    private fun profile(person: Person): String {
        val result = write(person, "/volunteers/me", mapOf("displayName" to "Тестовый волонтёр", "regularity" to "UNSURE"))
        check(result.response.status == 200)
        return tree(result)["id"].asString()
    }
    private fun role(staff: Person, name: String = "Тестовый вид ${UUID.randomUUID()}"): String {
        val result = write(staff, "/coordination/volunteer-roles", mapOf("name" to name), create = true)
        check(result.response.status == 201)
        return tree(result)["id"].asString()
    }
    private fun decision(status: String, version: Long = 0, message: String = "Пояснение для волонтёра") = mapOf(
        "version" to version, "fields" to mapOf("status" to status, "message" to message, "internalNote" to "Внутреннее основание"),
    )
    private fun read(person: Person, path: String) = mvc.perform(get("/api/v1$path").session(person.session)).andReturn()
    private fun csrf(session: MockHttpSession): Pair<String, String> {
        val value = tree(mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn())
        return value["headerName"].asString() to value["token"].asString()
    }
    private fun write(person: Person, path: String, body: Any, create: Boolean = false, token: Pair<String, String> = csrf(person.session)): MvcResult =
        mvc.perform((if (create) post("/api/v1$path") else put("/api/v1$path")).session(person.session)
            .header(token.first, token.second).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))).andReturn()
    private fun tree(result: MvcResult) = json.readTree(result.response.contentAsString)
}
