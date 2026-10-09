import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>) {
  await sql`ALTER TABLE agent_credentials ADD COLUMN last_contact_at timestamptz(3) DEFAULT NULL`.execute(db);
  await sql`UPDATE agent_credentials SET last_contact_at=accepted_at WHERE accepted_at IS NOT NULL`.execute(db);
}
export async function down(): Promise<void> {
  throw new Error("agent_contact_requires_forward_repair");
}
