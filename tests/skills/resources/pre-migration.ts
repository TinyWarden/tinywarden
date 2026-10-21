import {beforeFleet} from './pre-fleet';
import {sql,type Kysely} from 'kysely';
import type {Database} from '../../../server/db/types';
// Reserved database fixture only. Recreate the empty pre-030 structures while
// preserving all existing v1 observations, policies, audit and recovery data.
export async function beforeResources(db:Kysely<Database>){
 const target=await sql<{name:string}>`SELECT current_database() AS name`.execute(db);
 if(target.rows[0]?.name!=='tinywarden_test_p1b')throw Error('test_database_required');
 if((await db.selectFrom('skill_resource_memberships').select('id').execute()).length)throw Error('empty_resources_required');
 await db.transaction().execute(async trx=>{
  await beforeFleet(trx);
  for(const table of ['history_subjects','history_events','notification_cursors'])await sql`ALTER TABLE ${sql.id('tinywarden',table)} DROP COLUMN resource_collection,DROP COLUMN resource_key,DROP COLUMN resource_epoch,DROP COLUMN evaluation_revision`.execute(trx);
  await sql`ALTER TABLE tinywarden.skill_runtime_hosts DROP COLUMN resource_support`.execute(trx);
  await sql`DROP TABLE tinywarden.skill_resource_inventories,tinywarden.skill_resource_memberships,tinywarden.skill_resource_scans`.execute(trx);
  await sql`ALTER TABLE tinywarden.history_subjects ADD CONSTRAINT history_subjects_host_id_subject_key_key UNIQUE(host_id,subject_key)`.execute(trx);
  await sql`CREATE UNIQUE INDEX notification_current_subject ON tinywarden.notification_cursors(route_id,host_id,subject_key) WHERE current`.execute(trx);
  await sql`DELETE FROM tinywarden.kysely_migration WHERE name='030_skill_resources'`.execute(trx);
 });
}
