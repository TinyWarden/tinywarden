import {sql,type Transaction} from 'kysely';
import type {Database} from '../../../server/db/types';
/** Reserved fixture rewind only: never a production down migration. */
export async function beforeFleet(trx:Transaction<Database>){
 const target=(await sql<{name:string}>`SELECT current_database() name`.execute(trx)).rows[0]?.name;
 if(target!=='tinywarden_test_p1b')throw Error('test_database_required');
 const tables=['agent_update_requests','fleet_purge_jobs','fleet_operation_items','fleet_audit','fleet_operations','fleet_group_hosts','fleet_host_tags','fleet_agent_control','fleet_maintenance','fleet_groups'];
 for(const table of tables){const rows=(await sql<{count:string}>`SELECT count(*)::text count FROM ${sql.id('tinywarden',table)}`.execute(trx)).rows;if(rows[0]?.count!=='0')throw Error('empty_fleet_required');}
 const hosts=await trx.selectFrom('hosts').select('id').where(eb=>eb.or([eb('lifecycle','!=','active'),eb('fleet_revision','!=','1'),eb('monitoring_epoch','!=','1'),eb('description','!=',''),eb('owner_notes','!=','')])).limit(1).execute();
 const policy=await trx.selectFrom('data_retention_policy').selectAll().executeTakeFirstOrThrow();
 if(hosts.length||policy.days!==90||policy.revision!=='1'||policy.expired_before.getUTCFullYear()!==1)throw Error('default_fleet_required');
 if(await trx.selectFrom('enrollment_tokens').select('id').where(sql<boolean>`fleet_intent<>'{}'::jsonb`).limit(1).executeTakeFirst())throw Error('empty_fleet_required');
 const snapshots=['check_assignment_snapshots','baseline_snapshots','skill_assignments','skill_manual_runs','skill_states'];
 for(const table of snapshots){if((await sql`SELECT 1 FROM ${sql.id('tinywarden',table)} WHERE monitoring_epoch<>1 LIMIT 1`.execute(trx)).rows.length)throw Error('default_fleet_required');}
 await sql`DROP FUNCTION tinywarden.fleet_insert_fence CASCADE`.execute(trx);
 await sql`DROP INDEX tinywarden.fleet_host_order,tinywarden.fleet_host_lifecycle`.execute(trx);
 for(const table of tables)await sql`DROP TABLE ${sql.id('tinywarden',table)} CASCADE`.execute(trx);
 await sql`DROP TABLE tinywarden.data_retention_policy`.execute(trx);
 await sql`ALTER TABLE tinywarden.enrollment_tokens DROP COLUMN fleet_intent`.execute(trx);
 for(const table of snapshots)await sql`ALTER TABLE ${sql.id('tinywarden',table)} DROP COLUMN monitoring_epoch`.execute(trx);
 await sql`ALTER TABLE tinywarden.hosts DROP COLUMN lifecycle,DROP COLUMN fleet_revision,DROP COLUMN monitoring_epoch,DROP COLUMN monitoring_changed_at,DROP COLUMN description,DROP COLUMN owner_notes`.execute(trx);
 const definition=(await sql<{definition:string}>`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='tinywarden.audit_events'::regclass AND conname='audit_retention_shape'`.execute(trx)).rows[0]!.definition.replace(/\(retention_days >= 1\) AND \(retention_days <= 3650\)/,'retention_days = 90');
 if(!definition.includes('retention_days = 90'))throw Error('unexpected_retention_constraint');
 await sql`ALTER TABLE tinywarden.audit_events DROP CONSTRAINT audit_retention_shape,ADD CONSTRAINT audit_retention_shape ${sql.raw(definition)}`.execute(trx);
 for(const [head,name,revisions]of [['host_check_policies','host_policy_current_fk','host_check_policy_revisions'],['baseline_policies','baseline_current_policy_fk','baseline_policy_revisions']]){
  await sql`ALTER TABLE ${sql.id('tinywarden',head!)} DROP CONSTRAINT ${sql.id(name!)},ADD CONSTRAINT ${sql.id(name!)} FOREIGN KEY(host_id,definition_key,current_policy_version) REFERENCES ${sql.id('tinywarden',revisions!)}(host_id,definition_key,version) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`.execute(trx);
 }
 await sql`DELETE FROM tinywarden.kysely_migration WHERE name IN('031_fleet_management','032_fleet_recovery','033_agent_update_requests')`.execute(trx);
}
