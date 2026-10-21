import { sql, type Kysely } from 'kysely';

export async function up(db:Kysely<unknown>) {
  // Opaque confirmation provenance survives deletion of target payloads. Older
  // unconfirmed records fail closed and require a fresh destructive operation.
  await sql`ALTER TABLE tinywarden.fleet_operations ADD COLUMN removal_policy_revision bigint
    CHECK(removal_policy_revision IS NULL OR (removal_policy_revision BETWEEN 1 AND 9007199254740991
      AND kind IN('archive','delete')))`.execute(db);
  await sql`CREATE OR REPLACE FUNCTION tinywarden.fleet_insert_fence() RETURNS trigger LANGUAGE plpgsql
    SET search_path=pg_catalog,tinywarden AS $$
    DECLARE row_data jsonb:=to_jsonb(NEW); owner uuid; state text;
    BEGIN
      owner:=NULLIF(row_data->>'host_id','')::uuid;
      IF owner IS NULL AND row_data->>'agent_id' IS NOT NULL THEN
        SELECT host_id INTO owner FROM tinywarden.agents WHERE id=(row_data->>'agent_id')::uuid;
      END IF;
      IF owner IS NULL AND TG_TABLE_NAME='enrollment_tokens' THEN
        SELECT a.host_id INTO owner FROM tinywarden.agents a WHERE a.id=(row_data->>'target_agent_id')::uuid;
      END IF;
      IF owner IS NULL AND TG_TABLE_NAME='disk_run_mounts' THEN
        SELECT host_id INTO owner FROM tinywarden.disk_runs WHERE id=(row_data->>'run_id')::uuid;
      END IF;
      IF owner IS NULL AND TG_TABLE_NAME IN('skill_metric_frames','skill_metric_samples') THEN
        SELECT host_id INTO owner FROM tinywarden.skill_observations WHERE id=(row_data->>'observation_id')::uuid;
      END IF;
      IF owner IS NULL AND TG_TABLE_NAME='notification_outbox' THEN
        SELECT host_id INTO owner FROM tinywarden.notification_cursors WHERE id=(row_data->>'cursor_id')::uuid;
      END IF;
      IF owner IS NULL AND TG_TABLE_NAME='audit_events' AND row_data->>'notification_event' IS NOT NULL THEN
        SELECT c.host_id INTO owner FROM tinywarden.notification_outbox o
          JOIN tinywarden.notification_cursors c ON c.id=o.cursor_id WHERE o.id=(row_data->>'notification_event')::uuid;
      END IF;
      IF owner IS NULL AND TG_TABLE_NAME='audit_events' AND row_data->>'notification_attempt' IS NOT NULL THEN
        SELECT c.host_id INTO owner FROM tinywarden.notification_outbox o
          JOIN tinywarden.notification_cursors c ON c.id=o.cursor_id WHERE o.attempt_id=(row_data->>'notification_attempt')::uuid;
      END IF;
      IF owner IS NOT NULL THEN
        SELECT lifecycle INTO state FROM tinywarden.hosts WHERE id=owner FOR KEY SHARE;
        IF state='deleting' THEN RAISE EXCEPTION 'fleet_host_deleting' USING ERRCODE='P0001';END IF;
      END IF;
      RETURN NEW;
    END $$`.execute(db);
}
export async function down() { throw new Error('fleet_management_requires_forward_repair'); }
