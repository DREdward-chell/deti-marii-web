package org.detimarii.platform.identity.internal

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

enum class AccountRole { VOLUNTEER, COORDINATOR, ADMIN }

class AccountCredentials(val id: UUID, val email: String, val passwordHash: String)

data class AccountView(val id: UUID, val email: String, val roles: Set<AccountRole>)

@Repository
class AccountRepository(private val jdbc: JdbcTemplate) {
    fun create(email: String, passwordHash: String): UUID? {
        val id = UUID.randomUUID()
        val inserted = jdbc.update(
            "insert into identity.account (id, email, password_hash) values (?, ?, ?) on conflict (email) do nothing",
            id, email, passwordHash,
        )
        if (inserted == 0) return null
        jdbc.update("insert into identity.account_role (account_id, role) values (?, 'VOLUNTEER')", id)
        return id
    }

    fun findCredentials(email: String): AccountCredentials? = jdbc.query(
        "select id, email, password_hash from identity.account where email = ?",
        { row, _ -> AccountCredentials(row.getObject("id", UUID::class.java), row.getString("email"), row.getString("password_hash")) },
        email,
    ).singleOrNull()

    fun find(id: UUID): AccountView? = jdbc.query(
        "select id, email from identity.account where id = ?",
        { row, _ -> row.getString("email") },
        id,
    ).singleOrNull()?.let { AccountView(id, it, roles(id)) }

    fun roles(id: UUID): Set<AccountRole> = jdbc.query(
        "select role from identity.account_role where account_id = ? order by role",
        { row, _ -> AccountRole.valueOf(row.getString("role")) },
        id,
    ).toSet()
}
