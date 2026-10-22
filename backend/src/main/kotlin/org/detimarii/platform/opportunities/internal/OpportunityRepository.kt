package org.detimarii.platform.opportunities.internal

import org.detimarii.platform.opportunities.OpportunityContent
import org.detimarii.platform.opportunities.OpportunityDraft
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

data class PublishedOpportunity(val id: UUID, val version: Int, val content: OpportunityContent, val publishedAt: Instant)

@Repository
class OpportunityRepository(private val jdbc: JdbcTemplate, private val json: ObjectMapper) {
    private val draftMapper = RowMapper { row, _ -> OpportunityDraft(
        row.getObject("id", UUID::class.java), row.getLong("revision"), json.readValue(row.getString("draft"), OpportunityContent::class.java),
        row.getObject("published_version", Int::class.javaObjectType), row.getObject("published_revision", Long::class.javaObjectType),
    ) }
    private val publicationMapper = RowMapper { row, _ -> PublishedOpportunity(
        row.getObject("opportunity_id", UUID::class.java), row.getInt("version"), json.readValue(row.getString("content"), OpportunityContent::class.java), row.getTimestamp("published_at").toInstant(),
    ) }
    fun drafts(): List<OpportunityDraft> = jdbc.query("select * from opportunities.opportunity order by updated_at desc, id", draftMapper)
    fun draft(id: UUID, lock: Boolean = false): OpportunityDraft? = jdbc.query(
        "select * from opportunities.opportunity where id = ?" + if (lock) " for update" else "", draftMapper, id,
    ).singleOrNull()
    fun create(actor: UUID): OpportunityDraft {
        val draft = jdbc.query("insert into opportunities.opportunity (id, draft, updated_by) values (?, ?::jsonb, ?) returning *",
            draftMapper, UUID.randomUUID(), json.writeValueAsString(OpportunityContent()), actor).single()
        audit(draft, "CREATE", actor)
        return draft
    }
    fun save(id: UUID, content: OpportunityContent, actor: UUID): OpportunityDraft {
        val draft = jdbc.query("update opportunities.opportunity set draft = ?::jsonb, revision = revision + 1, updated_by = ?, updated_at = clock_timestamp() where id = ? returning *",
            draftMapper, json.writeValueAsString(content), actor, id).single()
        audit(draft, "SAVE", actor)
        return draft
    }
    fun publish(draft: OpportunityDraft, actor: UUID): OpportunityDraft {
        val version = jdbc.queryForObject("select publication_count + 1 from opportunities.opportunity where id = ?", Int::class.java, draft.id)!!
        jdbc.update("insert into opportunities.opportunity_version (opportunity_id, version, source_revision, content, published_by) values (?, ?, ?, ?::jsonb, ?)",
            draft.id, version, draft.revision, json.writeValueAsString(draft.content), actor)
        val saved = jdbc.query("update opportunities.opportunity set published_version = ?, published_revision = revision, publication_count = ?, updated_by = ?, updated_at = clock_timestamp() where id = ? returning *",
            draftMapper, version, version, actor, draft.id).single()
        audit(saved, "PUBLISH", actor)
        return saved
    }
    fun withdraw(draft: OpportunityDraft, actor: UUID): OpportunityDraft {
        audit(draft, "WITHDRAW", actor)
        return jdbc.query("update opportunities.opportunity set published_version = null, published_revision = null, updated_by = ?, updated_at = clock_timestamp() where id = ? returning *",
            draftMapper, actor, draft.id).single()
    }
    private fun audit(draft: OpportunityDraft, action: String, actor: UUID) {
        jdbc.update("insert into opportunities.opportunity_action (opportunity_id, action, draft_revision, publication_version, actor_id) values (?, ?, ?, ?, ?)",
            draft.id, action, draft.revision, draft.publishedVersion, actor)
    }
    private val currentPublication = "from opportunities.opportunity o join opportunities.opportunity_version v on v.opportunity_id = o.id and v.version = o.published_version"
    fun publication(id: UUID): PublishedOpportunity? = jdbc.query("select v.* $currentPublication where o.id = ?", publicationMapper, id).singleOrNull()
    fun roleIds(): Set<UUID> = jdbc.query("select distinct v.role_id $currentPublication",
        { row, _ -> row.getObject("role_id", UUID::class.java) }).toSet()
    fun search(q: String, regularity: String?, roleId: UUID?, page: Int, size: Int): Pair<List<PublishedOpportunity>, Long> {
        val clauses = mutableListOf<String>()
        val args = mutableListOf<Any>()
        if (q.isNotEmpty()) {
            clauses += "(v.content->>'title' ilike ? escape '!' or v.content->>'summary' ilike ? escape '!')"
            val pattern = "%" + q.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"
            args += pattern; args += pattern
        }
        if (regularity != null) { clauses += "v.content->>'regularity' = ?"; args += regularity }
        if (roleId != null) { clauses += "v.role_id = ?"; args += roleId }
        val where = if (clauses.isEmpty()) "" else " where " + clauses.joinToString(" and ")
        val total = jdbc.queryForObject("select count(*) $currentPublication$where", Long::class.java, *args.toTypedArray())!!
        val items = jdbc.query("select v.* $currentPublication$where order by v.published_at desc, o.id limit ? offset ?",
            publicationMapper, *(args + listOf(size, page.toLong() * size)).toTypedArray())
        return items to total
    }
}
