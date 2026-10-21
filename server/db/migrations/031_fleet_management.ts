import { sql, type Kysely } from "kysely";

// Authority and historical identity stay independent from observation retention.
export async function up(db: Kysely<unknown>) {
  await sql`ALTER TABLE tinywarden.hosts
    ADD COLUMN lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','paused','archived','deleting')),
    ADD COLUMN fleet_revision bigint NOT NULL DEFAULT 1 CHECK(fleet_revision BETWEEN 1 AND 9007199254740991),
    ADD COLUMN monitoring_epoch bigint NOT NULL DEFAULT 1 CHECK(monitoring_epoch BETWEEN 1 AND 9007199254740991),
    ADD COLUMN monitoring_changed_at timestamptz(3),
    ADD COLUMN description text NOT NULL DEFAULT '' CHECK(char_length(description)<=2000),
    ADD COLUMN owner_notes text NOT NULL DEFAULT '' CHECK(char_length(owner_notes)<=2000)`.execute(db);
  // Keep current-policy integrity at commit while permitting bounded deletion of
  // a final revision/head pair. RESTRICT's delete check cannot be deferred.
  await sql`ALTER TABLE tinywarden.host_check_policies DROP CONSTRAINT host_policy_current_fk,
    ADD CONSTRAINT host_policy_current_fk FOREIGN KEY(host_id,definition_key,current_policy_version)
    REFERENCES tinywarden.host_check_policy_revisions(host_id,definition_key,version)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`.execute(db);
  await sql`ALTER TABLE tinywarden.baseline_policies DROP CONSTRAINT baseline_current_policy_fk,
    ADD CONSTRAINT baseline_current_policy_fk FOREIGN KEY(host_id,definition_key,current_policy_version)
    REFERENCES tinywarden.baseline_policy_revisions(host_id,definition_key,version)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`.execute(db);
  const retentionCheck=await sql<{definition:string}>`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint
    WHERE conrelid='tinywarden.audit_events'::regclass AND conname='audit_retention_shape'`.execute(db);
  const definition=retentionCheck.rows[0]?.definition;
  if(!definition?.includes('retention_days = 90'))throw new Error('audit_retention_constraint_missing');
  await sql`ALTER TABLE tinywarden.audit_events DROP CONSTRAINT audit_retention_shape,
    ADD CONSTRAINT audit_retention_shape ${sql.raw(definition.replace('retention_days = 90','retention_days BETWEEN 1 AND 3650'))}`.execute(db);
  await sql`CREATE INDEX fleet_host_order ON tinywarden.hosts(lower(label),id)`.execute(db);
  await sql`CREATE INDEX fleet_host_lifecycle ON tinywarden.hosts(lifecycle,lower(label),id)`.execute(db);
  for (const table of ['check_assignment_snapshots','baseline_snapshots','skill_assignments','skill_manual_runs','skill_states']) {
    await sql`ALTER TABLE ${sql.id('tinywarden',table)} ADD COLUMN monitoring_epoch bigint NOT NULL DEFAULT 1
      CHECK(monitoring_epoch BETWEEN 1 AND 9007199254740991)`.execute(db);
  }
  await sql`CREATE TABLE tinywarden.fleet_groups (
    id uuid PRIMARY KEY, name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 64 AND name=btrim(name)),
    description text NOT NULL DEFAULT '' CHECK(char_length(description)<=2000),
    revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991), created_at timestamptz(3) NOT NULL)`.execute(db);
  await sql`CREATE UNIQUE INDEX fleet_group_name ON tinywarden.fleet_groups(lower(name))`.execute(db);
  await sql`CREATE TABLE tinywarden.fleet_group_hosts (
    group_id uuid NOT NULL REFERENCES tinywarden.fleet_groups(id) ON DELETE RESTRICT,
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT, PRIMARY KEY(group_id,host_id))`.execute(db);
  await sql`CREATE INDEX fleet_group_host ON tinywarden.fleet_group_hosts(host_id,group_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.fleet_host_tags (
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    tag text NOT NULL CHECK(char_length(tag) BETWEEN 1 AND 64 AND tag=lower(btrim(tag))), PRIMARY KEY(host_id,tag))`.execute(db);
  await sql`CREATE INDEX fleet_tags_lookup ON tinywarden.fleet_host_tags(tag,host_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.fleet_agent_control (
    agent_id uuid PRIMARY KEY REFERENCES tinywarden.agents(id) ON DELETE RESTRICT,
    generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
    reported_at timestamptz(3) NOT NULL, applied_epoch bigint,
    applied_at timestamptz(3), CHECK((applied_epoch IS NULL AND applied_at IS NULL) OR
      (applied_epoch BETWEEN 1 AND 9007199254740991 AND applied_at IS NOT NULL)))`.execute(db);
  await sql`CREATE TABLE tinywarden.fleet_maintenance (
    id uuid PRIMARY KEY, host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    starts_at timestamptz(3) NOT NULL, ends_at timestamptz(3), closed_at timestamptz(3),
    revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
    created_at timestamptz(3) NOT NULL, CHECK(ends_at IS NULL OR ends_at>starts_at))`.execute(db);
  await sql`CREATE UNIQUE INDEX fleet_maintenance_open ON tinywarden.fleet_maintenance(host_id) WHERE closed_at IS NULL`.execute(db);
  await sql`CREATE INDEX fleet_maintenance_host_time ON tinywarden.fleet_maintenance(host_id,starts_at DESC)`.execute(db);
  await sql`CREATE TABLE tinywarden.fleet_operations (
    id uuid PRIMARY KEY, operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32), kind text NOT NULL,
    payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536), created_at timestamptz(3) NOT NULL)`.execute(db);
  await sql`CREATE INDEX fleet_operations_actor ON tinywarden.fleet_operations(operator_id,created_at DESC,id)`.execute(db);
  await sql`CREATE TABLE tinywarden.fleet_operation_items (
    operation_id uuid NOT NULL REFERENCES tinywarden.fleet_operations(id) ON DELETE RESTRICT,
    host_id uuid NOT NULL, expected_revision bigint NOT NULL CHECK(expected_revision BETWEEN 1 AND 9007199254740991),
    state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','conflict','failed','not_applicable')),
    outcome text, revision bigint, completed_at timestamptz(3), PRIMARY KEY(operation_id,host_id))`.execute(db);
  await sql`CREATE INDEX fleet_operation_host ON tinywarden.fleet_operation_items(host_id,operation_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.fleet_audit (
    id uuid PRIMARY KEY, occurred_at timestamptz(3) NOT NULL, operator_id uuid REFERENCES tinywarden.operators(id) ON DELETE RESTRICT,
    host_id uuid, operation_id uuid, action text NOT NULL CHECK(action ~ '^[a-z_]{1,48}$'),
    facts jsonb NOT NULL CHECK(octet_length(facts::text)<=8192))`.execute(db);
  await sql`CREATE INDEX fleet_audit_host_time ON tinywarden.fleet_audit(host_id,occurred_at DESC,id)`.execute(db);
  await sql`CREATE TABLE tinywarden.data_retention_policy (
    singleton boolean PRIMARY KEY CHECK(singleton), days integer NOT NULL DEFAULT 90 CHECK(days BETWEEN 1 AND 3650),
    revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
    expired_before timestamptz(3) NOT NULL DEFAULT '0001-01-01T00:00:00Z')`.execute(db);
  await sql`INSERT INTO tinywarden.data_retention_policy(singleton) VALUES(true)`.execute(db);
  await sql`CREATE TABLE tinywarden.fleet_purge_jobs (
    host_id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES tinywarden.fleet_operations(id) ON DELETE RESTRICT,
    state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','failed','completed')),
    stage integer NOT NULL DEFAULT 0 CHECK(stage>=0), deleted_rows bigint NOT NULL DEFAULT 0 CHECK(deleted_rows>=0),
    created_at timestamptz(3) NOT NULL, updated_at timestamptz(3) NOT NULL, error text)`.execute(db);
  await sql`CREATE INDEX fleet_purge_pending ON tinywarden.fleet_purge_jobs(updated_at,host_id) WHERE state<>'completed'`.execute(db);
  await sql`ALTER TABLE tinywarden.enrollment_tokens
    ADD COLUMN fleet_intent jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(fleet_intent)='object' AND octet_length(fleet_intent::text)<=8192)`.execute(db);
  for (const name of ['fleet_groups','fleet_group_hosts','fleet_host_tags','fleet_agent_control','fleet_maintenance',
    'fleet_operations','fleet_operation_items','fleet_audit','data_retention_policy','fleet_purge_jobs']) {
    await sql`REVOKE ALL ON ${sql.id('tinywarden',name)} FROM PUBLIC`.execute(db);
  }
  // Generic insertion fence: a late worker cannot recreate owned rows after the
  // deletion boundary. Budget triggers must still account existing row deletions.
  await sql`CREATE FUNCTION tinywarden.fleet_insert_fence() RETURNS trigger LANGUAGE plpgsql
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
      IF owner IS NOT NULL THEN
        SELECT lifecycle INTO state FROM tinywarden.hosts WHERE id=owner FOR KEY SHARE;
        IF state='deleting' THEN RAISE EXCEPTION 'fleet_host_deleting' USING ERRCODE='P0001';END IF;
      END IF;
      RETURN NEW;
    END $$`.execute(db);
  for(const table of ['agents','agent_credentials','enrollment_tokens','audit_events','access_user_hosts','access_group_hosts',
    'host_check_policies','host_check_policy_revisions','check_assignment_snapshots','check_mutation_receipts',
    'baseline_policies','baseline_policy_revisions','baseline_snapshots','baseline_receipts','baseline_recovery_latches',
    'disk_runs','disk_run_mounts','disk_run_receipts','disk_recovery_latches','baseline_runs','baseline_run_receipts',
    'host_skill_policies','host_skill_policy_revisions','skill_assignments','skill_observations','skill_states','skill_package_receipts',
    'skill_runtime_hosts','skill_manual_runs','skill_metric_frames','skill_metric_samples','history_subjects','history_events',
    'notification_cursors','notification_outbox','host_agent_update_policies','agent_platform_reports',
    'skill_resource_memberships','skill_resource_inventories','skill_resource_scans','fleet_agent_control','fleet_group_hosts','fleet_host_tags','fleet_maintenance']){
    await sql`CREATE TRIGGER fleet_insert_fence BEFORE INSERT ON ${sql.id('tinywarden',table)} FOR EACH ROW EXECUTE FUNCTION tinywarden.fleet_insert_fence()`.execute(db);
  }

}
export async function down() { throw new Error('fleet_management_requires_forward_repair'); }
