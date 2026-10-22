package org.detimarii.platform.onboarding

import java.util.UUID

/** Public change only: private coordinator notes must never enter notifications. */
data class VolunteerUpdate(val volunteerId: UUID, val key: String, val message: String)
