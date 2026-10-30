import {sql,type Kysely} from 'kysely';

/** Extend the bounded append-only diagnostic lane; all existing rows stay valid. */
export async function up(db:Kysely<unknown>){
 await sql`ALTER TABLE tinywarden.maintenance_logs DROP CONSTRAINT maintenance_logs_sequence_check,
  ADD CONSTRAINT maintenance_logs_sequence_check CHECK(sequence BETWEEN 1 AND 1024)`.execute(db);
}

export async function down(db:Kysely<unknown>){
 // Refuse a lossy downgrade when the larger transcript capacity has been used.
 await sql`ALTER TABLE tinywarden.maintenance_logs DROP CONSTRAINT maintenance_logs_sequence_check,
  ADD CONSTRAINT maintenance_logs_sequence_check CHECK(sequence BETWEEN 1 AND 128)`.execute(db);
}
