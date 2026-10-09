import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>):Promise<void>{
  await sql`CREATE TABLE tinywarden.skill_metric_frames (
    observation_id uuid PRIMARY KEY REFERENCES tinywarden.skill_observations(id) ON DELETE CASCADE,
    host_id uuid NOT NULL REFERENCES tinywarden.hosts(id) ON DELETE RESTRICT,
    installation_id uuid NOT NULL REFERENCES tinywarden.skill_installations(id) ON DELETE RESTRICT,
    content_sha256 text NOT NULL REFERENCES tinywarden.skill_packages(content_sha256) ON DELETE RESTRICT,
    sampled_at timestamptz(3) NOT NULL, recovery_epoch uuid,
    format smallint NOT NULL CHECK(format=1),
    flags jsonb NOT NULL CHECK(jsonb_typeof(flags)='object' AND octet_length(flags::text)<=32768)
  )`.execute(db);
  await sql`CREATE INDEX skill_metric_frame_window ON tinywarden.skill_metric_frames
    (host_id,installation_id,content_sha256,sampled_at,observation_id)`.execute(db);
  await sql`CREATE TABLE tinywarden.skill_metric_samples (
    observation_id uuid NOT NULL REFERENCES tinywarden.skill_metric_frames(observation_id) ON DELETE CASCADE,
    metric_key text NOT NULL CHECK(metric_key ~ '^[a-z][a-z0-9_]{0,63}$'),
    series_key text NOT NULL CHECK(octet_length(series_key) BETWEEN 1 AND 128 AND series_key !~ '[[:cntrl:]]'),
    label text NOT NULL CHECK(octet_length(label)<=256),
    value numeric(29,9) NOT NULL CHECK(abs(value)<=18446744073709551615 AND value::text NOT IN ('NaN','Infinity','-Infinity')),
    PRIMARY KEY(observation_id,metric_key,series_key)
  )`.execute(db);
  await sql`REVOKE ALL ON tinywarden.skill_metric_frames,tinywarden.skill_metric_samples FROM PUBLIC`.execute(db);
}
export async function down():Promise<void>{throw new Error("skill_metrics_require_forward_repair");}
