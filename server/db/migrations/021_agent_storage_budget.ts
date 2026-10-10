import { sql, type Kysely } from "kysely";

// Conservative allocation units include row/index overhead. Existing identities
// remain replayable; the ceiling applies to new allocations, never heartbeats.
export async function up(db: Kysely<unknown>) {
  await sql`CREATE TABLE tinywarden.agent_storage_budgets (
    agent_id uuid PRIMARY KEY REFERENCES tinywarden.agents(id) ON DELETE RESTRICT,
    used_bytes bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
    max_bytes bigint NOT NULL DEFAULT 2147483648 CHECK (max_bytes > 0),
    result_tokens double precision NOT NULL DEFAULT 256,
    result_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    assignment_tokens double precision NOT NULL DEFAULT 256,
    assignment_at timestamptz NOT NULL DEFAULT clock_timestamp()
  )`.execute(db);
  await sql`REVOKE ALL ON tinywarden.agent_storage_budgets FROM PUBLIC`.execute(db);
  const tables = ["disk_runs", "baseline_runs", "disk_run_receipts", "baseline_run_receipts",
    "skill_observations", "skill_package_receipts", "check_assignment_snapshots", "baseline_snapshots", "skill_assignments"];
  const metrics = ["skill_metric_frames", "skill_metric_samples"];
  for (const name of [...tables, "disk_run_mounts", ...metrics]) {
    await sql`ALTER TABLE ${sql.raw("tinywarden." + name)} ADD COLUMN allocation_bytes bigint NOT NULL DEFAULT 0`.execute(db);
    await sql`UPDATE ${sql.raw("tinywarden." + name)} r SET allocation_bytes=pg_column_size(r)::bigint*4+1024`.execute(db);
  }
  for (const name of tables) {
    await sql`INSERT INTO tinywarden.agent_storage_budgets(agent_id, used_bytes)
      SELECT agent_id, sum(allocation_bytes) FROM ${sql.raw("tinywarden." + name)} r
      GROUP BY agent_id ON CONFLICT (agent_id) DO UPDATE
      SET used_bytes=agent_storage_budgets.used_bytes+EXCLUDED.used_bytes`.execute(db);
  }
  await sql`INSERT INTO tinywarden.agent_storage_budgets(agent_id, used_bytes)
    SELECT r.agent_id, sum(m.allocation_bytes)
    FROM tinywarden.disk_run_mounts m JOIN tinywarden.disk_runs r ON r.id=m.run_id
    GROUP BY r.agent_id ON CONFLICT (agent_id) DO UPDATE
    SET used_bytes=agent_storage_budgets.used_bytes+EXCLUDED.used_bytes`.execute(db);
  // Metric rows share a reading's retention lifecycle and are charged separately.
  for (const name of metrics) await sql`INSERT INTO tinywarden.agent_storage_budgets(agent_id, used_bytes)
    SELECT o.agent_id, sum(m.allocation_bytes)
    FROM ${sql.raw("tinywarden." + name)} m JOIN tinywarden.skill_observations o ON o.id=m.observation_id
    GROUP BY o.agent_id ON CONFLICT (agent_id) DO UPDATE
    SET used_bytes=agent_storage_budgets.used_bytes+EXCLUDED.used_bytes`.execute(db);
  await sql`CREATE FUNCTION tinywarden.account_agent_storage() RETURNS trigger
    LANGUAGE plpgsql SET search_path=pg_catalog,tinywarden AS $$
    DECLARE row_data jsonb; owner uuid; cost bigint; extra bigint := 0;
      budget tinywarden.agent_storage_budgets%ROWTYPE; at timestamptz := clock_timestamp();
      tokens double precision; converting boolean := false;
    BEGIN
      row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
      IF TG_OP='DELETE' THEN cost := -OLD.allocation_bytes;
      ELSE cost := pg_column_size(NEW)::bigint*4+1024; NEW.allocation_bytes := cost; END IF;
      IF TG_TABLE_NAME='disk_run_mounts' THEN
        SELECT agent_id INTO owner FROM tinywarden.disk_runs WHERE id=(row_data->>'run_id')::uuid;
      ELSIF TG_TABLE_NAME IN ('skill_metric_frames','skill_metric_samples') THEN
        SELECT agent_id INTO owner FROM tinywarden.skill_observations WHERE id=(row_data->>'observation_id')::uuid;
      ELSE owner := (row_data->>'agent_id')::uuid; END IF;
      -- Parent deletion accounts for cascaded child rows while they still exist.
      IF TG_OP='DELETE' AND TG_TABLE_NAME='disk_runs' THEN
        SELECT coalesce(sum(m.allocation_bytes),0) INTO extra
          FROM tinywarden.disk_run_mounts m WHERE run_id=OLD.id;
      ELSIF TG_OP='DELETE' AND TG_TABLE_NAME='skill_observations' THEN
        SELECT coalesce(sum(costs.n),0) INTO extra FROM (
          SELECT allocation_bytes AS n FROM tinywarden.skill_metric_frames WHERE observation_id=OLD.id
          UNION ALL SELECT allocation_bytes AS n FROM tinywarden.skill_metric_samples WHERE observation_id=OLD.id
        ) costs;
      END IF;
      IF owner IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
      INSERT INTO tinywarden.agent_storage_budgets(agent_id) VALUES(owner) ON CONFLICT DO NOTHING;
      SELECT * INTO budget FROM tinywarden.agent_storage_budgets WHERE agent_id=owner FOR UPDATE;
      IF TG_OP='INSERT' THEN
        IF TG_TABLE_NAME='disk_run_receipts' THEN
          converting := EXISTS(SELECT 1 FROM tinywarden.disk_runs WHERE id=NEW.id);
        ELSIF TG_TABLE_NAME='baseline_run_receipts' THEN
          converting := EXISTS(SELECT 1 FROM tinywarden.baseline_runs WHERE id=NEW.id);
        END IF;
        IF NOT converting AND budget.used_bytes+cost > budget.max_bytes THEN
          RAISE EXCEPTION 'agent_storage_budget' USING ERRCODE='P0001';
        END IF;
        IF TG_TABLE_NAME IN ('disk_runs','baseline_runs','skill_observations') THEN
          tokens := least(256, budget.result_tokens+4*greatest(0,extract(epoch FROM at-budget.result_at)));
          IF tokens < 1 THEN RAISE EXCEPTION 'agent_ingestion_budget' USING ERRCODE='P0001'; END IF;
          UPDATE tinywarden.agent_storage_budgets SET result_tokens=tokens-1,result_at=at WHERE agent_id=owner;
        ELSIF TG_TABLE_NAME IN ('check_assignment_snapshots','baseline_snapshots','skill_assignments') THEN
          tokens := least(256, budget.assignment_tokens+greatest(0,extract(epoch FROM at-budget.assignment_at))/60);
          IF tokens < 1 THEN RAISE EXCEPTION 'agent_assignment_budget' USING ERRCODE='P0001'; END IF;
          UPDATE tinywarden.agent_storage_budgets SET assignment_tokens=tokens-1,assignment_at=at WHERE agent_id=owner;
        END IF;
      END IF;
      UPDATE tinywarden.agent_storage_budgets SET used_bytes=greatest(0,used_bytes+cost-extra) WHERE agent_id=owner;
      RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
    END $$`.execute(db);
  for (const name of [...tables, "disk_run_mounts", ...metrics]) {
    await sql`CREATE TRIGGER agent_storage_budget BEFORE INSERT OR DELETE
      ON ${sql.raw("tinywarden." + name)} FOR EACH ROW EXECUTE FUNCTION tinywarden.account_agent_storage()`.execute(db);
  }
  await sql`ALTER TABLE tinywarden.disk_run_mounts ADD CONSTRAINT absolute_mount_paths
    CHECK (left(mount_path,1)='/' AND left(mount_root,1)='/') NOT VALID`.execute(db);
}
export async function down(): Promise<void> { throw new Error("storage_budget_requires_forward_repair"); }
