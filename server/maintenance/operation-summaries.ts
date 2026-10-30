import {sql,type Transaction} from 'kysely';
import type {Database} from '../db/types';
import type {SkillOperationSummary} from '../../lib/maintenance/operation-summary';

/** Only summary metadata is returned. Saved plans, native output and grants stay in their owning reads. */
export function operationSummaryProjection(){return sql<SkillOperationSummary>`jsonb_build_object(
 'job_id',j.id,'operation_id',j.operation_id,'host_id',j.host_id,
 'installation_id',j.action_binding->>'installation_id','phase',j.phase,
 'attention',j.attention,'recovery_pending',j.recovery_pending,
 'created_at',j.created_at,'updated_at',j.updated_at,'completed_at',j.completed_at,
 'progress',jsonb_build_object('name',coalesce(nullif(btrim(j.action_snapshot->'catalog'->(j.action_snapshot->'descriptor'->>'name_key')->>'text'),''),o.payload->>'name'),
 'single',true,'server',h.label,'presentation',NULL))`;}

/** Each installed skill keeps its own latest operation, including settled results. */
export async function latestSkillOperations(trx:Transaction<Database>,host:string,at:Date){
 const {rows}=await sql<{summary:SkillOperationSummary}>`SELECT ${operationSummaryProjection()} summary
  FROM tinywarden.skill_installations s CROSS JOIN LATERAL (
   SELECT j.* FROM tinywarden.maintenance_jobs j WHERE j.host_id=${host}::uuid
    AND j.action_binding->>'installation_id'=s.id::text AND j.created_at<=${at}
   ORDER BY j.created_at DESC,j.id DESC LIMIT 1
  ) j INNER JOIN tinywarden.fleet_operations o ON o.id=j.operation_id
  INNER JOIN tinywarden.hosts h ON h.id=j.host_id ORDER BY s.id`.execute(trx);
 return rows.map(r=>r.summary);
}
