import {sql,type Transaction} from 'kysely';
import type {Database} from '../db/types';
import {collectionReadRoot,managementRoot,managementFinish,type FleetDb} from './management';
import {fleetHostLock} from './control';
import {fail} from '../errors';
import {uuid} from '../validation';
import {maintenancePurgeTables,purgeMaintenanceHost} from '../maintenance/job-retention';
import {activeMaintenance} from '../maintenance/fencing';

// Explicitly ordered children; shared notification routes are detached, never deleted.
const ordered=[
 'agent_action_readiness','agent_action_workers',
 'agent_platform_reports','audit_events','baseline_receipts','baseline_recovery_latches','baseline_run_receipts','baseline_runs',
 'check_mutation_receipts','disk_recovery_latches','disk_run_mounts','disk_run_receipts',
 'fleet_agent_control','fleet_group_hosts','fleet_host_tags','fleet_maintenance','history_events',
 'host_agent_update_policies','host_skill_policies','host_skill_policy_revisions','skill_manual_runs',
 'skill_metric_samples','skill_package_receipts','skill_resource_inventories','skill_resource_scans','skill_runtime_hosts','skill_states',
 'baseline_snapshots','disk_runs','enrollment_tokens','history_subjects','notification_outbox','skill_metric_frames',
 'baseline_policy_revisions','check_assignment_snapshots','notification_cursors','skill_observations','baseline_policies',
 'host_check_policy_revisions','skill_assignments','skill_resource_memberships','agent_credentials','host_check_policies',
 'agent_storage_budgets','access_group_hosts','access_user_hosts','agents','hosts','agent_update_requests'
] as const;
export const purgeTables=[...maintenancePurgeTables,...ordered,'skill_package_mutations','fleet_audit','fleet_operations','fleet_operation_items'];
const preStages=['mutations','fleet_audit','operation_receipts'] as const;
const stages=[...preStages,...ordered] as const;
function scope(table:string,host:string){
 const agents=sql`SELECT id FROM tinywarden.agents WHERE host_id=${host}::uuid`;
 const credentials=sql`SELECT id FROM tinywarden.agent_credentials WHERE agent_id IN (${agents})`;
 const tokens=sql`SELECT id FROM tinywarden.enrollment_tokens WHERE target_agent_id IN (${agents}) OR consumed_credential_id IN (${credentials})`;
 if(table==='audit_events')return sql<boolean>`host_id=${host}::uuid OR agent_id IN (${agents}) OR target_agent_id IN (${agents}) OR token_id IN (${tokens})
   OR notification_event IN(SELECT o.id FROM tinywarden.notification_outbox o JOIN tinywarden.notification_cursors c ON c.id=o.cursor_id WHERE c.host_id=${host}::uuid)
   OR notification_attempt IN(SELECT o.attempt_id FROM tinywarden.notification_outbox o JOIN tinywarden.notification_cursors c ON c.id=o.cursor_id WHERE c.host_id=${host}::uuid)`;
 if(table==='enrollment_tokens')return sql<boolean>`target_agent_id IN (${agents}) OR consumed_credential_id IN (${credentials})`;
 if(['agent_action_readiness','agent_action_workers','agent_credentials','agent_storage_budgets','agent_platform_reports','fleet_agent_control','skill_package_receipts'].includes(table))return sql<boolean>`agent_id IN (${agents})`;
 if(table==='disk_run_mounts')return sql<boolean>`run_id IN(SELECT id FROM tinywarden.disk_runs WHERE host_id=${host}::uuid)`;
 if(table==='notification_outbox')return sql<boolean>`cursor_id IN(SELECT id FROM tinywarden.notification_cursors WHERE host_id=${host}::uuid)`;
 if(table==='skill_metric_samples'||table==='skill_metric_frames')return sql<boolean>`observation_id IN(SELECT id FROM tinywarden.skill_observations WHERE host_id=${host}::uuid)`;
 if(table==='hosts')return sql<boolean>`id=${host}::uuid`;
 if(table==='host_check_policy_revisions')return sql<boolean>`host_id=${host}::uuid AND version<>(SELECT current_policy_version FROM tinywarden.host_check_policies p WHERE p.host_id=${host}::uuid AND p.definition_key=host_check_policy_revisions.definition_key)`;
 if(table==='baseline_policy_revisions')return sql<boolean>`host_id=${host}::uuid AND version<>(SELECT current_policy_version FROM tinywarden.baseline_policies p WHERE p.host_id=${host}::uuid AND p.definition_key=baseline_policy_revisions.definition_key)`;
 return sql<boolean>`host_id=${host}::uuid`;
}
export async function assertPurgeCoverage(trx:Transaction<Database>){
 const edges=(await sql<{child:string;parent:string}>`SELECT child.relname child,parent.relname parent FROM pg_constraint c
  JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace
  WHERE c.contype='f' AND n.nspname='tinywarden'`.execute(trx)).rows;
 const owned=new Set(['hosts','agents','agent_credentials','enrollment_tokens','maintenance_jobs']);
 let changed=true;while(changed){changed=false;for(const e of edges){if(e.child==='notification_routes')continue;if(owned.has(e.parent)&&!owned.has(e.child)){owned.add(e.child);changed=true;}}}
 for(const table of owned)if(!(purgeTables as readonly string[]).includes(table))throw new Error('purge_schema_unmapped');
}
async function chunk(trx:Transaction<Database>,table:string,condition:ReturnType<typeof sql<boolean>>){
 const result=await sql`DELETE FROM ${sql.id('tinywarden',table)} WHERE ctid IN
   (SELECT ctid FROM ${sql.id('tinywarden',table)} WHERE ${condition} ORDER BY ctid LIMIT 100 FOR UPDATE)`.execute(trx);
 return Number(result.numAffectedRows??0);
}
async function currentPolicies(trx:Transaction<Database>,host:string,baseline:boolean){
 const heads=baseline?'baseline_policies':'host_check_policies',revisions=baseline?'baseline_policy_revisions':'host_check_policy_revisions';
 // Historical versions were already removed in bounded batches. Each fixed legacy
 // head has at most one final revision; both disappear in this transaction.
 const result=await sql`DELETE FROM ${sql.id('tinywarden',revisions)} r USING ${sql.id('tinywarden',heads)} p
  WHERE p.host_id=${host}::uuid AND r.host_id=p.host_id AND r.definition_key=p.definition_key AND r.version=p.current_policy_version`.execute(trx);
 const removed=await chunk(trx,heads,sql`host_id=${host}::uuid`);return Number(result.numAffectedRows??0)+removed;
}
async function purgeStep(db:FleetDb,clock:()=>Date){
 const ref=await db.selectFrom('fleet_purge_jobs').select('host_id').where('state','in',['pending','running']).orderBy('updated_at').orderBy('host_id').limit(1).executeTakeFirst();
 if(!ref)return {worked:false,rows:0,completed:false};
 try{return await db.transaction().execute(async trx=>{
  await sql`SET LOCAL statement_timeout='5s'`.execute(trx);await sql`SET LOCAL transaction_timeout='5s'`.execute(trx);await sql`SET LOCAL lock_timeout='250ms'`.execute(trx);
  await collectionReadRoot(trx);const host=await fleetHostLock(trx,ref.host_id);
  const job=await trx.selectFrom('fleet_purge_jobs').selectAll().where('host_id','=',ref.host_id).forUpdate().executeTakeFirstOrThrow();
  if(job.state==='completed'||job.state==='failed')return {worked:false,rows:0,completed:job.state==='completed'};
  if(!host||host.lifecycle!=='deleting')throw new Error('purge_fence_missing');
  if(await activeMaintenance(trx,host.id))throw new Error('purge_maintenance_active');
  const at=clock(),stage=stages[job.stage];if(!stage)throw new Error('purge_stage_invalid');
  let rows:number,advance:boolean,completed=false;
  if(job.stage===0){await assertPurgeCoverage(trx);
    // scan_after belongs to a shared delivery route, not the deleted server.
    await trx.updateTable('notification_routes').set({scan_after:null}).where('scan_after','=',host.id).execute();
  }
  if(stage==='mutations'){
    rows=await chunk(trx,'skill_package_mutations',sql`result->>'host_id'=${host.id} OR result->>'host'=${host.id}
      OR result->>'id' IN(SELECT id::text FROM tinywarden.skill_manual_runs WHERE host_id=${host.id}::uuid)`);advance=rows<100;
  }else if(stage==='fleet_audit'){
    rows=await chunk(trx,'fleet_audit',sql`host_id=${host.id}::uuid AND NOT(action='delete' AND operation_id=${job.operation_id}::uuid)`);advance=rows<100;

  }else if(stage==='operation_receipts'){
    const maintenanceRows=await purgeMaintenanceHost(trx,host.id);
    if(maintenanceRows){rows=maintenanceRows;advance=false;}else{
    const items=await trx.selectFrom('fleet_operation_items').select('operation_id').where('host_id','=',host.id).where(eb=>eb.or([eb('outcome','is',null),eb('outcome','!=','server_deleted')])).orderBy('operation_id').limit(50).forUpdate().execute();
    if(items.length){const operations=items.map(i=>i.operation_id);
      await sql`UPDATE tinywarden.fleet_operations SET payload=CASE
        WHEN jsonb_array_length(COALESCE(payload->'targets','[]'::jsonb))<=1 THEN '{}'::jsonb
        ELSE jsonb_set(payload,'{targets}',COALESCE((SELECT jsonb_agg(t) FROM jsonb_array_elements(payload->'targets') t WHERE t->>'id'<>${host.id}),'[]'::jsonb)) END
        WHERE id=ANY(${operations}::uuid[])`.execute(trx);
      await trx.updateTable('fleet_operation_items').set({state:'completed',outcome:'server_deleted',revision:null,expected_revision:'1'})
        .where('host_id','=',host.id).where('operation_id','in',operations).execute();
    }rows=items.length*2;advance=items.length<50;
    }
  }else if(stage==='hosts'){
    rows=await chunk(trx,'hosts',scope('hosts',host.id));completed=rows===1;advance=true;
  }else if(stage==='baseline_policies'||stage==='host_check_policies'){
    rows=await currentPolicies(trx,host.id,stage==='baseline_policies');advance=true;
  }else if(stage==='agent_storage_budgets'){
    const budget=(await sql<{used_bytes:string}>`SELECT used_bytes FROM tinywarden.agent_storage_budgets WHERE agent_id IN(SELECT id FROM tinywarden.agents WHERE host_id=${host.id}::uuid)`.execute(trx)).rows;
    if(budget.some(b=>b.used_bytes!=='0'))throw new Error('purge_accounting_mismatch');
    rows=await chunk(trx,stage,scope(stage,host.id));advance=rows<100;
  }else{
    rows=await chunk(trx,stage,scope(stage,host.id));advance=rows<100;
  }
  await trx.updateTable('fleet_purge_jobs').set({state:completed?'completed':'running',stage:job.stage+(advance?1:0),deleted_rows:String(Number(job.deleted_rows)+rows),updated_at:at,error:null}).where('host_id','=',host.id).execute();
  return {worked:true,rows,completed};
 });}catch(error){
  const raw=error&&typeof error==='object'&&'code'in error?String(error.code):error instanceof Error?error.message:'';
  const transient=['55P03','57014','25P04','40001','40P01'].includes(raw);
  const reason=raw.startsWith('purge_')?raw:transient?'purge_retryable':'purge_failed';
  await db.updateTable('fleet_purge_jobs').set({state:transient?'pending':'failed',updated_at:clock(),error:reason}).where('host_id','=',ref.host_id).where('state','!=','completed').execute();
  return {worked:true,rows:0,completed:false,error:reason};
 }
}
export async function retryPurge(db:FleetDb,cookie:string,id:string,clock:()=>Date){
 const host=uuid(id);return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock,false);
  const job=await trx.selectFrom('fleet_purge_jobs').selectAll().where('host_id','=',host).forUpdate().executeTakeFirst();if(!job)fail('not_found',404);
  // Revisit earlier dependencies too: an older writer may have inserted a late
  // audit after its stage. Each stage remains bounded and idempotent.
  if(job.state==='failed')await trx.updateTable('fleet_purge_jobs').set({state:'pending',stage:0,error:null,updated_at:clock()}).where('host_id','=',host).execute();
  return {host_id:host,access:await managementFinish(trx,actor,clock)};
 });
}

/** Skip empty stages within a small time budget; one call deletes at most100 rows. */
export async function purgeNextBatch(db:FleetDb,clock:()=>Date){
 const started=performance.now();let result:Awaited<ReturnType<typeof purgeStep>>={worked:false,rows:0,completed:false};
 for(let n=0;n<8&&performance.now()-started<3000;n++){
  const next=await purgeStep(db,clock);result=next;
  if(!next.worked||next.rows||next.completed||('error'in next&&next.error))break;
 }
 return result;
}
