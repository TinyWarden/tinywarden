import { sql, type Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tinywarden.notification_outbox
    DROP CONSTRAINT notification_outbox_template_version_check,
    ADD CONSTRAINT notification_outbox_template_version_check CHECK(template_version IN (1,2)),
    ADD COLUMN message_snapshot jsonb,
    ADD CONSTRAINT notification_outbox_snapshot_check CHECK(message_snapshot IS NULL OR
      (jsonb_typeof(message_snapshot)='object' AND octet_length(message_snapshot::text)<=8192))`.execute(db);
}
export async function down(): Promise<void> { throw new Error("notification_messages_require_forward_repair"); }
