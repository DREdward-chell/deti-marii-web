package org.detimarii.platform.coordination.internal

import jakarta.validation.Valid
import org.detimarii.platform.opportunities.OpportunityManagement
import org.detimarii.platform.opportunities.PublishOpportunityRequest
import org.detimarii.platform.opportunities.SaveOpportunityRequest
import org.detimarii.platform.opportunities.WithdrawOpportunityRequest
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/v1/coordination")
@PreAuthorize("hasRole('COORDINATOR') and hasAuthority('STAFF_VERIFIED')")
class OpportunityController(private val opportunities: OpportunityManagement) {
    @GetMapping("/opportunities") fun list() = opportunities.list()
    @PostMapping("/opportunities") @ResponseStatus(HttpStatus.CREATED) fun create() = opportunities.create()
    @GetMapping("/opportunities/{id}") fun get(@PathVariable id: UUID) = opportunities.get(id)
    @PutMapping("/opportunities/{id}") fun save(@PathVariable id: UUID, @Valid @RequestBody request: SaveOpportunityRequest) = opportunities.save(id, request)
    @PostMapping("/opportunities/{id}/publish") fun publish(@PathVariable id: UUID, @Valid @RequestBody request: PublishOpportunityRequest) = opportunities.publish(id, request)
    @PostMapping("/opportunities/{id}/withdraw") fun withdraw(@PathVariable id: UUID, @Valid @RequestBody request: WithdrawOpportunityRequest) = opportunities.withdraw(id, request)
}
