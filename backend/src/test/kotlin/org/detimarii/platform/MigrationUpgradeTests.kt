package org.detimarii.platform

import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

class MigrationUpgradeTests {
    @Test
    fun `an existing V1 database upgrades without losing data or changing baseline history`() {
        PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))
            .withUsername("volunteers")
            .use { database ->
                database.start()
                val dataSource = DriverManagerDataSource(
                    database.jdbcUrl, database.username, database.password,
                )
                val jdbc = JdbcTemplate(dataSource)
                Flyway.configure().dataSource(dataSource).defaultSchema("public")
                    .target("1").load().migrate()
                val baselineChecksum = jdbc.queryForObject(
                    "select checksum from public.flyway_schema_history where version = '1'",
                    Int::class.java,
                )
                jdbc.execute("create table volunteers.upgrade_probe (id integer primary key)")
                jdbc.update("insert into volunteers.upgrade_probe (id) values (42)")

                val flyway = Flyway.configure().dataSource(dataSource).defaultSchema("public").load()
                flyway.migrate()

                assertThat(jdbc.queryForObject("select id from volunteers.upgrade_probe", Int::class.java))
                    .isEqualTo(42)
                assertThat(jdbc.queryForObject(
                    "select checksum from public.flyway_schema_history where version = '1'",
                    Int::class.java,
                )).isEqualTo(baselineChecksum)
                assertThat(jdbc.queryForList(
                    "select schema_name from information_schema.schemata", String::class.java,
                )).contains("learning")
                assertThat(jdbc.queryForObject(
                    "select count(*) from public.event_publication", Int::class.java,
                )).isZero()
                assertThat(flyway.migrate().migrationsExecuted).isZero()
            }
    }
}
