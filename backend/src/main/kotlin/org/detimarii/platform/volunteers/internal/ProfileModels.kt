package org.detimarii.platform.volunteers.internal

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

enum class Regularity { UNSURE, ONE_OFF, REGULAR }

data class SaveProfileRequest(
    @field:NotBlank(message = "Укажите, как к вам обращаться.")
    @field:Size(max = 100, message = "Имя должно быть не длиннее 100 символов.")
    val displayName: String,
    @field:Size(max = 40, message = "Телефон должен быть не длиннее 40 символов.")
    val phone: String = "",
    @field:Size(max = 1000, message = "Расскажите об интересах в пределах 1000 символов.")
    val interests: String = "",
    @field:Size(max = 1000, message = "Расскажите о навыках в пределах 1000 символов.")
    val skills: String = "",
    @field:Size(max = 500, message = "Укажите удобное время в пределах 500 символов.")
    val availability: String = "",
    val regularity: Regularity = Regularity.UNSURE,
    @field:PositiveOrZero val version: Long? = null,
) {
    fun fields() = ProfileFields(
        displayName.trim(), phone.trim(), interests.trim(), skills.trim(), availability.trim(), regularity,
    )
}

data class ProfileFields(
    val displayName: String,
    val phone: String,
    val interests: String,
    val skills: String,
    val availability: String,
    val regularity: Regularity,
)

data class ProfileView(
    val id: UUID,
    val displayName: String,
    val phone: String,
    val interests: String,
    val skills: String,
    val availability: String,
    val regularity: Regularity,
    val version: Long,
    val updatedAt: Instant,
) {
    fun fields() = ProfileFields(displayName, phone, interests, skills, availability, regularity)
}
