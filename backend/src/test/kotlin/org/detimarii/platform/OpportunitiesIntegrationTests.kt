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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(properties = ["POSTGRES_PASSWORD=testcontainers", "platform.auth.requests-per-minute=1000"])
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration::class, StaffAccessIntegrationTests.Config::class)
class OpportunitiesIntegrationTests @Autowired constructor(
    private val mvc: MockMvc, private val json: ObjectMapper, private val jdbc: JdbcTemplate,
    private val mail: StaffAccessIntegrationTests.TestMail,
) {
    private data class Person(val session: MockHttpSession)
    private val root = "/coordination/opportunities"

    @Test
    fun `draft publication withdrawal snapshots revisions and audit are atomic and idempotent`() {
        val staff = person(true); val owner = person(); val profile = profile(owner)
        paperwork(staff, profile, "CONFIRMED", 0)
        val role = role(staff)
        val id = tree(write(staff, root))["id"].asString()
        assertThat(read(owner, "/opportunities/$id").response.status).isEqualTo(404)
        assertThat(publish(staff, id, 0).response.status).isEqualTo(400)
        assertThat(save(staff, id, 0, content(role)).response.status).isEqualTo(200)
        assertThat(save(staff, id, 0, content(role)).response.status).isEqualTo(200)
        assertThat(save(staff, id, 0, content(role, "Stale")).response.status).isEqualTo(409)
        val published = tree(publish(staff, id, 1))
        assertThat(tree(publish(staff, id, 1))).isEqualTo(published)
        val original = tree(read(owner, "/opportunities/$id"))
        assertThat(original["version"].asInt()).isEqualTo(1)
        assertThat(original["admissionStatus"].asString()).isEqualTo("NOT_GRANTED")
        assertThat(original.has("content")).isFalse()
        assertThat(original.has("revision")).isFalse()
        assertThat(original.has("publishedBy")).isFalse()
        assertThat(save(staff, id, 1, content(role, "Private draft")).response.status).isEqualTo(200)
        assertThat(tree(read(owner, "/opportunities/$id"))).isEqualTo(original)
        assertThat(publish(staff, id, 1).response.status).isEqualTo(409)
        assertThat(tree(publish(staff, id, 2))["publishedVersion"].asInt()).isEqualTo(2)
        assertThat(withdraw(staff, id, 1).response.status).isEqualTo(409)
        assertThat(withdraw(staff, id, 2).response.status).isEqualTo(200)
        assertThat(withdraw(staff, id, 2).response.status).isEqualTo(200)
        assertThat(read(owner, "/opportunities/$id").response.status).isEqualTo(404)
        assertThat(tree(publish(staff, id, 2))["publishedVersion"].asInt()).isEqualTo(3)
        assertThat(jdbc.queryForObject("select count(*) from opportunities.opportunity_version where opportunity_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(3)
        assertThat(jdbc.queryForObject("select count(*) from opportunities.opportunity_action where opportunity_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(7)
        assertThat(jdbc.queryForObject("select content->>'title' from opportunities.opportunity_version where opportunity_id = ? and version = 1", String::class.java, UUID.fromString(id))).isEqualTo("Демонстрация")
        assertThat(jdbc.queryForObject("select count(distinct actor_id) from opportunities.opportunity_action where opportunity_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(1)
    }

    @Test
    fun `all volunteer routes recheck paperwork and expose own independent admission metadata`() {
        val staff = person(true); val owner = person(); val volunteer = profile(owner)
        val other = person(); val otherProfile = profile(other)
        paperwork(staff, otherProfile, "CONFIRMED", 0)
        val role = role(staff); val id = opportunity(staff, content(role))
        val paths = listOf("/opportunities", "/opportunities/filters", "/opportunities/$id")
        paths.forEach { assertThat(read(owner, it).response.status).isEqualTo(403) }
        val noProfile = person()
        paths.forEach { assertThat(read(noProfile, it).response.status).isEqualTo(404) }
        paperwork(staff, volunteer, "CONFIRMED", 0)
        paths.forEach { assertThat(read(owner, it).response.status).isEqualTo(200) }
        assertThat(tree(read(owner, "/opportunities/$id"))["admissionStatus"].asString()).isEqualTo("NOT_GRANTED")
        assertThat(write(staff, "/coordination/volunteers/$volunteer/admissions/$role", mapOf("version" to 0, "fields" to mapOf("status" to "GRANTED", "message" to "Тест")), false).response.status).isEqualTo(200)
        assertThat(tree(read(owner, "/opportunities/$id"))["admissionStatus"].asString()).isEqualTo("GRANTED")
        assertThat(tree(read(other, "/opportunities/$id"))["admissionStatus"].asString()).isEqualTo("NOT_GRANTED")
        assertThat(write(staff, "/coordination/volunteers/$volunteer/admissions/$role", mapOf("version" to 1, "fields" to mapOf("status" to "SUSPENDED", "message" to "Тест")), false).response.status).isEqualTo(200)
        assertThat(tree(read(owner, "/opportunities/$id"))["admissionStatus"].asString()).isEqualTo("SUSPENDED")
        assertThat(tree(read(owner, "/opportunities"))["items"].first { it["id"].asString() == id }["admissionStatus"].asString()).isEqualTo("SUSPENDED")
        paperwork(staff, volunteer, "NEEDS_UPDATE", 1)
        paths.forEach { assertThat(read(owner, it).response.status).isEqualTo(403) }
        paperwork(staff, volunteer, "CONFIRMED", 2)
        paths.forEach { assertThat(read(owner, it).response.status).isEqualTo(200) }
    }

    @Test
    fun `literal search filters and stable paging use published snapshots and current role metadata`() {
        val staff = person(true); val owner = person(); val volunteer = profile(owner)
        paperwork(staff, volunteer, "CONFIRMED", 0)
        val role = role(staff); val unusedRole = role(staff)
        val prefix = UUID.randomUUID().toString()
        val first = opportunity(staff, content(role, "$prefix 100%_!", "ONE_OFF"))
        val second = opportunity(staff, content(role, "$prefix next", "ONE_OFF"))
        opportunity(staff, content(role, "$prefix regular", "REGULAR"))
        val draftId = tree(write(staff, root))["id"].asString()
        save(staff, draftId, 0, content(unusedRole, "$prefix draft"))
        val query = "/opportunities?q=$prefix&roleId=$role&regularity=ONE_OFF&size=1"
        val page = tree(read(owner, query))
        assertThat(page["total"].asLong()).isEqualTo(2)
        assertThat(page["items"][0]["id"].asString()).isEqualTo(second)
        assertThat(tree(read(owner, "$query&page=1"))["items"][0]["id"].asString()).isEqualTo(first)
        assertThat(tree(read(owner, "$query&page=2"))["items"].size()).isZero()
        for (literal in listOf("%", "_", "!", "100%_!")) {
            val result = mvc.perform(get("/api/v1/opportunities").session(owner.session).param("q", literal).param("roleId", role)).andReturn()
            assertThat(tree(result)["total"].asLong()).isEqualTo(1)
            assertThat(tree(result)["items"][0]["id"].asString()).isEqualTo(first)
        }
        val summarySearch = mvc.perform(get("/api/v1/opportunities").session(owner.session).param("q", "  краткое  ").param("roleId", role)).andReturn()
        assertThat(tree(summarySearch)["total"].asLong()).isEqualTo(3)
        val filters = tree(read(owner, "/opportunities/filters"))["roles"]
        assertThat(filters.any { it["id"].asString() == role }).isTrue()
        assertThat(filters.any { it["id"].asString() == unusedRole }).isFalse()
        assertThat(write(staff, "/coordination/volunteer-roles/$role", mapOf("version" to 0, "fields" to mapOf("name" to "Переименован $role", "description" to "Новое описание")), false).response.status).isEqualTo(200)
        assertThat(tree(read(owner, "/opportunities/$first"))["role"]["description"].asString()).isEqualTo("Новое описание")
        assertThat(tree(read(owner, "/opportunities/$first"))["role"]["version"].asInt()).isEqualTo(1)
    }

    @Test
    fun `staff authentication csrf input bounds and publish requirements are enforced`() {
        val staff = person(true); val owner = person(); val id = tree(write(staff, root))["id"].asString()
        val role = role(staff)
        assertThat(read(owner, root).response.status).isEqualTo(403)
        assertThat(write(owner, root).response.status).isEqualTo(403)
        assertThat(read(person(true, false), root).response.status).isEqualTo(401)
        assertThat(mvc.perform(get("/api/v1/opportunities")).andReturn().response.status).isEqualTo(401)
        assertThat(mvc.perform(post("/api/v1$root").session(staff.session)).andReturn().response.status).isEqualTo(403)
        assertThat(save(staff, id, 0, content(UUID.randomUUID().toString())).response.status).isEqualTo(400)
        for ((field, limit) in mapOf("title" to 150, "summary" to 500, "description" to 6000, "location" to 500, "schedule" to 500, "requirements" to 2000, "training" to 2000)) {
            assertThat(save(staff, id, 0, content(role) + (field to "x".repeat(limit + 1))).response.status).describedAs(field).isEqualTo(400)
        }
        for ((index, field) in listOf("title", "summary", "description", "location", "schedule", "roleId").withIndex()) {
            val value = content(role) + (field to if (field == "roleId") null else "   ")
            assertThat(save(staff, id, index, value).response.status).isEqualTo(200)
            assertThat(publish(staff, id, index + 1).response.status).describedAs(field).isEqualTo(400)
        }
        val profile = profile(owner); paperwork(staff, profile, "CONFIRMED", 0)
        for (query in listOf("page=-1", "page=100001", "size=0", "size=101", "regularity=UNKNOWN", "roleId=bad", "q=" + "x".repeat(121))) {
            assertThat(read(owner, "/opportunities?$query").response.status).describedAs(query).isEqualTo(400)
        }
        assertThat(save(staff, id, 6, content(role) + ("regularity" to "UNKNOWN")).response.status).isEqualTo(400)
        assertThat(publish(staff, id, -1).response.status).isEqualTo(400)
        assertThat(withdraw(staff, id, 0).response.status).isEqualTo(400)
    }

    @Test
    fun `concurrent distinct edits have one winner and duplicate publication creates one snapshot`() {
        val staff = person(true); val role = role(staff); val id = tree(write(staff, root))["id"].asString()
        val token = csrf(staff.session); val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { pool ->
            val futures = (1..2).map { index -> pool.submit(Callable {
                gate.await(5, TimeUnit.SECONDS)
                write(staff, "$root/$id", mapOf("revision" to 0, "content" to content(role, "Version $index")), false, token).response.status
            }) }
            gate.countDown()
            assertThat(futures.map { it.get(10, TimeUnit.SECONDS) }).containsExactlyInAnyOrder(200, 409)
            val publications = (1..2).map { pool.submit(Callable { write(staff, "$root/$id/publish", mapOf("revision" to 1), token = token).response.status }) }
            assertThat(publications.map { it.get(10, TimeUnit.SECONDS) }).containsExactly(200, 200)
        }
        assertThat(jdbc.queryForObject("select count(*) from opportunities.opportunity_version where opportunity_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(1)
        assertThat(jdbc.queryForObject("select count(*) from opportunities.opportunity_action where opportunity_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(3)
    }

    private fun content(role: String, title: String = "Демонстрация", regularity: String = "FLEXIBLE") = mapOf(
        "title" to title, "summary" to "Краткое описание", "description" to "Только демонстрация", "roleId" to role,
        "regularity" to regularity, "location" to "Место будет согласовано", "schedule" to "По договорённости", "demo" to true)
    private fun save(staff: Person, id: String, revision: Int, content: Any) = write(staff, "$root/$id", mapOf("revision" to revision, "content" to content), false)
    private fun publish(staff: Person, id: String, revision: Int) = write(staff, "$root/$id/publish", mapOf("revision" to revision))
    private fun withdraw(staff: Person, id: String, version: Int) = write(staff, "$root/$id/withdraw", mapOf("publishedVersion" to version))
    private fun role(staff: Person): String = tree(write(staff, "/coordination/volunteer-roles", mapOf("name" to "Тест ${UUID.randomUUID()}")))["id"].asString()
    private fun opportunity(staff: Person, content: Any): String {
        val id = tree(write(staff, root))["id"].asString()
        check(save(staff, id, 0, content).response.status == 200)
        check(publish(staff, id, 1).response.status == 200)
        return id
    }
    private fun paperwork(staff: Person, id: String, status: String, version: Int) {
        check(write(staff, "/coordination/volunteers/$id/paperwork", mapOf("version" to version, "fields" to mapOf("status" to status, "message" to "Тест")), false).response.status == 200)
    }
    private fun person(staff: Boolean = false, verify: Boolean = true): Person {
        val email = "learning-${UUID.randomUUID()}@example.test"; val password = "synthetic learning test passphrase"
        val registration = write(Person(MockHttpSession()), "/auth/register", mapOf("email" to email, "password" to password))
        check(registration.response.status == 201)
        val id = UUID.fromString(tree(registration)["id"].asString())
        if (staff) jdbc.update("insert into identity.account_role values (?, 'COORDINATOR')", id)
        val person = Person(MockHttpSession())
        check(write(person, "/auth/login", mapOf("email" to email, "password" to password)).response.status == if (staff) 202 else 200)
        if (staff && verify) check(write(person, "/auth/email-code/verify", mapOf("code" to mail.codes.getValue(email))).response.status == 200)
        return person
    }
    private fun profile(person: Person): String {
        val result = write(person, "/volunteers/me", mapOf("displayName" to "Тест обучения", "regularity" to "UNSURE"), false)
        check(result.response.status == 200); return tree(result)["id"].asString()
    }
    private fun read(person: Person, path: String) = mvc.perform(get("/api/v1$path").session(person.session)).andReturn()
    private fun csrf(session: MockHttpSession): Pair<String, String> {
        val value = tree(mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn())
        return value["headerName"].asString() to value["token"].asString()
    }
    private fun write(person: Person, path: String, body: Any = emptyMap<String, String>(), create: Boolean = true, token: Pair<String, String> = csrf(person.session)): MvcResult =
        mvc.perform((if (create) post("/api/v1$path") else put("/api/v1$path")).session(person.session)
            .header(token.first, token.second).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))).andReturn()
    private fun tree(result: MvcResult) = json.readTree(result.response.contentAsString)
}
