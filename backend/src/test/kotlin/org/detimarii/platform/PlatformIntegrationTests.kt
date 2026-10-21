package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest(properties = ["POSTGRES_PASSWORD=testcontainers"])
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration::class)
class PlatformIntegrationTests @Autowired constructor(
    private val mvc: MockMvc,
    private val jdbc: JdbcTemplate,
    private val flyway: Flyway,
) {
    @Test
    fun `public system endpoint exposes the frontend contract`() {
        mvc.get("/api/v1/system/info").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("volunteer-platform") }
            jsonPath("$.version") { isNotEmpty() }
        }
    }

    @Test
    fun `readiness includes a working database without exposing details`() {
        mvc.get("/actuator/health/readiness").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("UP") }
            jsonPath("$.components") { doesNotExist() }
        }
    }

    @Test
    fun `unconfigured business endpoints are closed by default`() {
        mvc.get("/api/v1/volunteers").andExpect { status { isUnauthorized() } }
        mvc.post("/api/v1/volunteers").andExpect { status { isForbidden() } }
    }

    @Test
    fun `Flyway creates every domain namespace on a fresh PostgreSQL`() {
        val schemas = jdbc.queryForList(
            "select schema_name from information_schema.schemata",
            String::class.java,
        )
        assertThat(schemas).contains(
            "identity", "volunteers", "onboarding", "opportunities",
            "participation", "coordination", "notifications",
        )
        assertThat(jdbc.queryForObject(
            "select count(*) from flyway_schema_history where success = true and version = '1'",
            Int::class.java,
        )).isEqualTo(1)
    }

    @Test
    fun `a schema matching the database username does not move Flyway history on another migration run`() {
        assertThat(jdbc.queryForObject("select current_schema()", String::class.java)).isEqualTo("public")
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        assertThat(jdbc.queryForObject(
            "select count(*) from public.flyway_schema_history where success = true and version = '1'",
            Int::class.java,
        )).isEqualTo(1)
    }
}
