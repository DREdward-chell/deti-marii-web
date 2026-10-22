package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.detimarii.platform.learning.internal.LearningRepository
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.reset
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import java.util.concurrent.atomic.AtomicBoolean
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
class LearningIntegrationTests @Autowired constructor(
    private val mvc: MockMvc, private val json: ObjectMapper, private val jdbc: JdbcTemplate,
    private val mail: StaffAccessIntegrationTests.TestMail,
) {
    @MockitoSpyBean
    private lateinit var repository: LearningRepository

    private data class Person(val session: MockHttpSession)
    private val root = "/coordination/learning/courses"
    private val reading = UUID.randomUUID()
    private val choice = UUID.randomUUID()
    private val ordering = UUID.randomUUID()
    private val a = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff")
    private val b = UUID.fromString("00000000-0000-0000-0000-000000000001")

    @Test
    fun `draft conflicts immutable versions idempotent publication and withdrawal`() {
        val staff = person(true); val owner = person(); profile(owner)
        val id = tree(write(staff, root))["id"].asString()
        assertThat(write(staff, "$root/$id/publish", mapOf("revision" to 0)).response.status).isEqualTo(400)
        assertThat(tree(read(owner, "/learning/courses")).any { it["id"].asString() == id }).isFalse()
        assertThat(save(staff, id, 0).response.status).isEqualTo(200)
        assertThat(save(staff, id, 0, "Stale").response.status).isEqualTo(409)
        val published = publish(staff, id, 1)
        assertThat(tree(publish(staff, id, 1))).isEqualTo(tree(published))
        val old = enrollment(owner, id)
        assertThat(enrollment(owner, id)).isEqualTo(old)
        save(staff, id, 1, "New title")
        assertThat(tree(read(owner, "/learning/enrollments/$old"))["summary"]["title"].asString()).isEqualTo("Демо")
        assertThat(tree(publish(staff, id, 2))["publishedVersion"].asInt()).isEqualTo(2)
        assertThat(start(owner, id).response.status).isEqualTo(409)
        assertThat(enrollment(owner, id, 2)).isNotEqualTo(old)
        assertThat(write(staff, "$root/$id/withdraw", mapOf("publishedVersion" to 1)).response.status).isEqualTo(409)
        assertThat(write(staff, "$root/$id/withdraw", mapOf("publishedVersion" to 2)).response.status).isEqualTo(200)
        assertThat(read(owner, "/learning/enrollments/$old").response.status).isEqualTo(404)
        assertThat(start(owner, id, 2).response.status).isEqualTo(404)
        assertThat(answer(owner, old, reading).response.status).isEqualTo(404)
        assertThat(tree(publish(staff, id, 2))["publishedVersion"].asInt()).isEqualTo(3)
        assertThat(jdbc.queryForObject("select count(*) from learning.course_version where course_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(3)
    }

    @Test
    fun `server grades sequence and two mechanics without granting clearance and resumes saved progress`() {
        val staff = person(true); val owner = person(); val volunteer = profile(owner)
        val id = enrollment(owner, course(staff)); val path = "/learning/enrollments/$id"
        val initial = read(owner, path)
        assertThat(initial.response.contentAsString).doesNotContain("correctOptionId", "Объяснение", "Второй материал")
        assertThat(answer(owner, id, choice, b).response.status).isEqualTo(409)
        assertThat(answer(owner, id, reading, a).response.status).isEqualTo(400)
        answer(owner, id, reading)
        val wrong = tree(answer(owner, id, choice, b))
        assertThat(wrong["lessons"][1]["feedback"]["correct"].asBoolean()).isFalse()
        assertThat(wrong["lessons"][1]["feedback"]["explanation"].asString()).isEqualTo("Объяснение")
        assertThat(wrong["summary"]["completedLessons"].asInt()).isEqualTo(1)
        assertThat(tree(read(owner, path))["lessons"][1]["feedback"]["optionId"].asString()).isEqualTo(b.toString())
        val correct = tree(answer(owner, id, choice, a))
        assertThat(correct["lessons"][2]["options"][0]["id"].asString()).isEqualTo(b.toString())
        assertThat(answer(owner, id, ordering, order = listOf(a, a)).response.status).isEqualTo(400)
        assertThat(tree(answer(owner, id, ordering, order = listOf(b, a)))["summary"]["completedLessons"].asInt()).isEqualTo(2)
        val done = tree(answer(owner, id, ordering, order = listOf(a, b)))
        assertThat(done["summary"]["completedLessons"].asInt()).isEqualTo(3)
        assertThat(done["summary"]["completedAt"].isNull).isFalse()
        val clearance = tree(read(owner, "/onboarding/me/clearance"))
        assertThat(clearance["paperwork"]["status"].asString()).isEqualTo("NOT_CONFIRMED")
        assertThat(clearance["admissions"].size()).isZero()
        assertThat(tree(read(staff, "/coordination/volunteers/$volunteer/learning"))[0]["completedLessons"].asInt()).isEqualTo(3)
        assertThat(tree(read(owner, path))).isEqualTo(done)
    }

    @Test
    fun `current and pinned audience restrict existing progress and idempotent retries after paperwork changes`() {
        val staff = person(true); val owner = person(); val volunteer = profile(owner)
        val course = course(staff); val old = enrollment(owner, course); val key = UUID.randomUUID()
        answer(owner, old, reading, key = key)
        save(staff, course, 1, audience = "CONFIRMED_PAPERWORK"); publish(staff, course, 2)
        assertThat(read(owner, "/learning/enrollments/$old").response.status).isEqualTo(403)
        assertThat(answer(owner, old, reading, key = key).response.status).isEqualTo(403)
        assertThat(tree(read(owner, "/learning/courses")).any { it["id"].asString() == course }).isFalse()
        paperwork(staff, volunteer, "CONFIRMED", 0)
        val private = enrollment(owner, course, 2)
        assertThat(read(owner, "/learning/enrollments/$old").response.status).isEqualTo(200)
        save(staff, course, 2); publish(staff, course, 3)
        paperwork(staff, volunteer, "NEEDS_UPDATE", 1)
        assertThat(read(owner, "/learning/enrollments/$old").response.status).isEqualTo(200)
        assertThat(read(owner, "/learning/enrollments/$private").response.status).isEqualTo(403)
        assertThat(answer(owner, private, reading).response.status).isEqualTo(403)
        paperwork(staff, volunteer, "CONFIRMED", 2)
        assertThat(read(owner, "/learning/enrollments/$private").response.status).isEqualTo(200)
    }

    @Test
    fun `concurrent duplicate answers persist once changed reuse and completed lessons conflict`() {
        val staff = person(true); val owner = person(); profile(owner)
        val id = enrollment(owner, course(staff)); val key = UUID.randomUUID()
        val token = csrf(owner.session); val gate = CountDownLatch(1)
        Executors.newFixedThreadPool(2).use { pool ->
            val futures = (1..2).map { pool.submit(Callable {
                gate.await(5, TimeUnit.SECONDS)
                write(owner, "/learning/enrollments/$id/answers", mapOf("requestId" to key, "lessonId" to reading), token = token).response.status
            }) }
            gate.countDown()
            assertThat(futures.map { it.get(10, TimeUnit.SECONDS) }).containsExactly(200, 200)
        }
        assertThat(jdbc.queryForObject("select count(*) from learning.lesson_attempt where enrollment_id = ?", Long::class.java, UUID.fromString(id))).isEqualTo(1)
        assertThat(answer(owner, id, choice, a, key = key).response.status).isEqualTo(409)
        assertThat(answer(owner, id, reading).response.status).isEqualTo(409)
    }

    @Test
    fun `concurrent completion cannot mix progress and completion time in read responses`() {
        val staff = person(true); val owner = person(); val volunteer = profile(owner)
        for (kind in listOf("enrollment", "catalog", "staff")) {
            val course = course(staff)
            val id = enrollment(owner, course)
            answer(owner, id, reading)
            answer(owner, id, choice, a)
            val paused = CountDownLatch(1)
            val resume = CountDownLatch(1)
            val first = AtomicBoolean(true)
            // Pause after enrollment metadata was read, before attempts are fetched.
            doAnswer { invocation ->
                if (first.compareAndSet(true, false)) {
                    paused.countDown()
                    check(resume.await(10, TimeUnit.SECONDS))
                }
                invocation.callRealMethod()
            }.`when`(repository).attempts(UUID.fromString(id))
            try {
                Executors.newSingleThreadExecutor().use { pool ->
                    val pending = pool.submit(Callable {
                        when (kind) {
                            "catalog" -> read(owner, "/learning/courses")
                            "staff" -> read(staff, "/coordination/volunteers/$volunteer/learning")
                            else -> read(owner, "/learning/enrollments/$id")
                        }
                    })
                    try {
                        assertThat(paused.await(5, TimeUnit.SECONDS)).isTrue()
                        val completed = answer(owner, id, ordering, order = listOf(a, b))
                        assertThat(completed.response.status).isEqualTo(200)
                        assertThat(tree(completed)["summary"]["completedAt"].isNull).isFalse()
                    } finally {
                        resume.countDown()
                    }
                    val result = pending.get(10, TimeUnit.SECONDS)
                    assertThat(result.response.status).isEqualTo(200)
                    val body = tree(result)
                    val summary = when (kind) {
                        "catalog" -> body.first { it["id"].asString() == course }["enrollments"].first { it["id"].asString() == id }
                        "staff" -> body.first { it["id"].asString() == id }
                        else -> body["summary"]
                    }
                    assertThat(summary["completedLessons"].asInt()).describedAs(kind).isEqualTo(2)
                    assertThat(summary["completedAt"].isNull).describedAs(kind).isTrue()
                    assertThat(tree(read(owner, "/learning/enrollments/$id"))["summary"]["completedLessons"].asInt()).isEqualTo(3)
                }
            } finally {
                resume.countDown()
                reset(repository)
            }
        }
    }

    @Test
    fun `ownership verified staff csrf and malformed drafts are enforced`() {
        val staff = person(true); val owner = person(); val volunteer = profile(owner)
        val other = person(); profile(other)
        val course = course(staff); val id = enrollment(owner, course)
        assertThat(read(other, "/learning/enrollments/$id").response.status).isEqualTo(404)
        assertThat(answer(other, id, reading).response.status).isEqualTo(404)
        assertThat(read(owner, root).response.status).isEqualTo(403)
        assertThat(write(owner, root).response.status).isEqualTo(403)
        assertThat(read(owner, "/coordination/volunteers/$volunteer/learning").response.status).isEqualTo(403)
        assertThat(read(staff, "/coordination/volunteers/${UUID.randomUUID()}/learning").response.status).isEqualTo(404)
        assertThat(read(person(true, false), root).response.status).isEqualTo(401)
        assertThat(read(person(), "/learning/courses").response.status).isEqualTo(404)
        assertThat(mvc.perform(post("/api/v1/learning/courses/$course/start").session(owner.session).contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}")).andReturn().response.status).isEqualTo(403)
        assertThat(mvc.perform(get("/api/v1/learning/courses")).andReturn().response.status).isEqualTo(401)
        assertThat(save(staff, course, 1, "x".repeat(151)).response.status).isEqualTo(400)
        val duplicate = content().toMutableMap(); val lessons = duplicate["lessons"] as List<*>
        duplicate["lessons"] = listOf(lessons[0], lessons[0])
        assertThat(write(staff, "$root/$course", mapOf("revision" to 1, "content" to duplicate), false).response.status).isEqualTo(400)
    }

    private fun content(title: String = "Демо", audience: String = "ALL_VOLUNTEERS") = mapOf(
        "title" to title, "description" to "Демонстрация, не правила фонда", "demo" to true, "audience" to audience,
        "lessons" to listOf(
            mapOf("id" to reading, "title" to "Чтение", "body" to "Первый шаг", "type" to "READ"),
            mapOf("id" to choice, "title" to "Выбор", "body" to "Второй материал", "type" to "SINGLE_CHOICE", "options" to listOf(mapOf("id" to a, "text" to "Да"), mapOf("id" to b, "text" to "Нет")), "correctOptionId" to a, "explanation" to "Объяснение"),
            mapOf("id" to ordering, "title" to "Порядок", "body" to "Сначала А, потом Б", "type" to "ORDERING", "options" to listOf(mapOf("id" to a, "text" to "А"), mapOf("id" to b, "text" to "Б")), "explanation" to "Сначала А, потом Б"),
        ),
    )
    private fun save(staff: Person, id: String, revision: Int, title: String = "Демо", audience: String = "ALL_VOLUNTEERS") =
        write(staff, "$root/$id", mapOf("revision" to revision, "content" to content(title, audience)), false)
    private fun publish(staff: Person, id: String, revision: Int) = write(staff, "$root/$id/publish", mapOf("revision" to revision))
    private fun course(staff: Person): String {
        val id = tree(write(staff, root))["id"].asString()
        check(save(staff, id, 0).response.status == 200); check(publish(staff, id, 1).response.status == 200)
        return id
    }
    private fun start(owner: Person, id: String, version: Int = 1) = write(owner, "/learning/courses/$id/start", mapOf("version" to version))
    private fun enrollment(owner: Person, id: String, version: Int = 1) = tree(start(owner, id, version))["summary"]["id"].asString()
    private fun answer(owner: Person, id: String, lesson: UUID, option: UUID? = null, order: List<UUID> = emptyList(), key: UUID = UUID.randomUUID()) =
        write(owner, "/learning/enrollments/$id/answers", mapOf("requestId" to key, "lessonId" to lesson, "optionId" to option, "order" to order))
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
