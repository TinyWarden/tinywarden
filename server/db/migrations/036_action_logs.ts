import {sql,type Kysely} from 'kysely';

export async function up(db:Kysely<unknown>){
 await sql`CREATE TABLE tinywarden.maintenance_logs (
  job_id uuid NOT NULL REFERENCES tinywarden.maintenance_jobs(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 128),
  record jsonb NOT NULL CHECK(octet_length(record::text)<=2048),
  fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
  received_at timestamptz(3) NOT NULL,
  PRIMARY KEY(job_id,sequence)
 )`.execute(db);
 await sql`CREATE TRIGGER maintenance_log_immutable BEFORE UPDATE ON tinywarden.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION tinywarden.maintenance_immutable_record()`.execute(db);
}

export async function down(db:Kysely<unknown>){
 await sql`DROP TABLE tinywarden.maintenance_logs`.execute(db);
}
