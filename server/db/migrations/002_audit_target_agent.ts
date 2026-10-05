import { sql, type Kysely } from "kysely";

// Additive expansion: historical events retain their original actor fields and NULL target.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tinywarden.audit_events ADD COLUMN target_agent_id uuid
    REFERENCES tinywarden.agents(id) ON DELETE RESTRICT`.execute(db);
  await sql`CREATE INDEX audit_events_target_agent
    ON tinywarden.audit_events(target_agent_id)`.execute(db);
}

export async function down(): Promise<void> {
  throw new Error("audit_target_history_requires_forward_repair");
}
