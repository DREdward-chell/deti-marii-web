package org.detimarii.platform.identity.internal

import org.springframework.http.HttpStatus
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.Locale
import java.util.UUID

fun normalizeEmail(email: String): String = email.trim().lowercase(Locale.ROOT)

@Service
class AccountService(private val accounts: AccountRepository, private val passwords: PasswordEncoder) {
    @Transactional
    fun register(email: String, password: String): AccountView {
        val normalizedEmail = normalizeEmail(email)
        val id = accounts.create(normalizedEmail, checkNotNull(passwords.encode(password)))
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Этот email уже зарегистрирован. Войдите в свой аккаунт.")
        return AccountView(id, normalizedEmail, setOf(AccountRole.VOLUNTEER))
    }

    @Transactional(readOnly = true)
    fun get(id: UUID): AccountView = accounts.find(id)
        ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Войдите в аккаунт ещё раз.")
}
