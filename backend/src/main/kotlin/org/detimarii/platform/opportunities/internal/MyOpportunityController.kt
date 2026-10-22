package org.detimarii.platform.opportunities.internal

import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import org.detimarii.platform.opportunities.OpportunityRegularity
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/v1/opportunities")
class MyOpportunityController(private val opportunities: MyOpportunityService) {
    @GetMapping
    fun list(@RequestParam(defaultValue = "") @Size(max = 120) q: String,
        @RequestParam(required = false) regularity: OpportunityRegularity?, @RequestParam(required = false) roleId: UUID?,
        @RequestParam(defaultValue = "0") @Min(0) @Max(100000) page: Int,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) size: Int) = opportunities.list(q, regularity, roleId, page, size)
    @GetMapping("/filters") fun filters() = opportunities.filters()
    @GetMapping("/{id}") fun get(@PathVariable id: UUID) = opportunities.get(id)
}
