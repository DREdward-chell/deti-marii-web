package org.detimarii.platform.volunteers.internal

import org.detimarii.platform.identity.CurrentAccount
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
@PreAuthorize("hasRole('VOLUNTEER')")
class MyProfileService(private val profiles: ProfileRepository, private val currentAccount: CurrentAccount) {
    @Transactional(readOnly = true)
    fun get(): ProfileView = profiles.findForAccount(currentAccount.id())
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Анкета ещё не заполнена.")

    @Transactional
    fun save(request: SaveProfileRequest): ProfileView {
        val accountId = currentAccount.id()
        val fields = request.fields()
        val current = profiles.findForAccount(accountId)
        if (current?.fields() == fields) return current

        val saved = when {
            current == null && request.version == null -> profiles.create(accountId, fields)
            current != null && request.version == current.version -> profiles.update(accountId, current.version, fields)
            else -> null
        }
        if (saved != null) return saved

        // A concurrent identical PUT is a successful retry, not a second profile or a new revision.
        val latest = profiles.findForAccount(accountId)
        if (latest?.fields() == fields) return latest
        throw ResponseStatusException(
            HttpStatus.CONFLICT,
            "Анкета уже изменена в другом окне. Загрузите актуальную версию перед сохранением.",
        )
    }
}
