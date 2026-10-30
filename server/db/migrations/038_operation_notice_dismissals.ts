import {sql,type Kysely} from 'kysely';

/** Account presentation preferences follow retained jobs; they cannot change work. */
export async function up(db:Kysely<unknown>){
 await sql`CREATE TABLE tinywarden.operation_notice_dismissals (
  operator_id uuid NOT NULL REFERENCES tinywarden.operators(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES tinywarden.maintenance_jobs(id) ON DELETE CASCADE,
  job_updated_at timestamptz(3) NOT NULL, dismissed_at timestamptz(3) NOT NULL,
  PRIMARY KEY(operator_id,job_id))`.execute(db);
 await sql`CREATE INDEX operation_notice_dismissals_job ON tinywarden.operation_notice_dismissals(job_id)`.execute(db);
}
export async function down(db:Kysely<unknown>){await sql`DROP TABLE tinywarden.operation_notice_dismissals`.execute(db);}
