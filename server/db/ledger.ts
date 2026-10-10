import { sql, type Kysely } from "kysely";
import type { Database } from "./types";

export const currentMigrations = ["001_initial", "002_audit_target_agent", "003_check_definitions",
  "004_disk_runs", "005_disk_recovery_latches", "006_baseline_definitions", "007_baseline_runs",
  "008_observation_retention", "009_notifications", "010_fleet_history", "011_fstrim_context", "012_skill_enablement", "013_field_overrides",
  "014_package_skills", "015_package_subjects", "016_skill_metrics", "017_notification_messages", "018_skill_manual_runs", "019_skill_collection_history", "020_agent_contact", "021_agent_storage_budget"] as const;
export async function requireCurrentLedger(db: Kysely<Database>) {
  const names = (await sql<{ name: string }>`SELECT name FROM tinywarden.kysely_migration ORDER BY name`
    .execute(db)).rows.map((row) => row.name);
  if (names.join(",") !== currentMigrations.join(",")) throw new Error("wrong_migration_ledger");
}
