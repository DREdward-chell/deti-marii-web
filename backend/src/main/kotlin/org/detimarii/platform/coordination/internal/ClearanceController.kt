package org.detimarii.platform.coordination.internal

import jakarta.validation.Valid
import org.detimarii.platform.onboarding.ClearanceWorkflow
import org.detimarii.platform.onboarding.SaveAdmissionRequest
import org.detimarii.platform.onboarding.SavePaperworkRequest
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/v1/coordination/volunteers/{id}")
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class ClearanceController(private val clearance: ClearanceWorkflow) {
    @GetMapping("/paperwork")
    fun paperwork(@PathVariable id: UUID) = clearance.paperwork(id)

    @PutMapping("/paperwork")
    fun savePaperwork(@PathVariable id: UUID, @Valid @RequestBody request: SavePaperworkRequest) = clearance.savePaperwork(id, request)

    @GetMapping("/admissions/{roleId}")
    fun admission(@PathVariable id: UUID, @PathVariable roleId: UUID) = clearance.admission(id, roleId)

    @PutMapping("/admissions/{roleId}")
    fun saveAdmission(@PathVariable id: UUID, @PathVariable roleId: UUID, @Valid @RequestBody request: SaveAdmissionRequest) = clearance.saveAdmission(id, roleId, request)
}
