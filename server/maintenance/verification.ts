import type {Transaction} from 'kysely';
import type {Database} from '../db/types';
import {packageProjections,type PackageProjection} from '../skills/results/package-projection';
import {currentScope,contextKey} from '../skills/manual/lifecycle';
import {fail} from '../errors';
import {maintenanceDigest} from './validation';
import type {VerificationMember,VerificationSnapshot} from '../../lib/maintenance/contracts';

function policy(rows:PackageProjection[]){return rows.map(row=>({id:row.installation_id,enabled:row.enabled,content:row.content_sha256,settings:row.source_revision,policy:row.policy_version,enablement:row.enablement_version})).sort((a,b)=>a.id.localeCompare(b.id));}
export async function currentVerificationPolicy(trx:Transaction<Database>,host:string,at:Date){return maintenanceDigest(policy(await packageProjections(trx,[host],at)));}


function coverage(value:VerificationSnapshot){return {policy_sha256:value.policy_sha256,not_configured:value.not_configured,
 members:value.members.map(({installation_id,package_sha256,settings_revision,scope_sha256})=>({installation_id,package_sha256,settings_revision,scope_sha256}))};}
export function sameVerificationCoverage(a:VerificationSnapshot,b:VerificationSnapshot){return maintenanceDigest(coverage(a))===maintenanceDigest(coverage(b));}

/** Caller holds access/package/host locks. No package IDs or rendered labels define health. */
export async function verificationSnapshot(trx:Transaction<Database>,host:string,at:Date):Promise<VerificationSnapshot>{
 const projections=await packageProjections(trx,[host],at),members:VerificationMember[]=[],not_configured:string[]=[];
 for(const row of projections){
  if(!row.enabled)continue;
  if(row.state==='not_configured'){not_configured.push(row.installation_id);continue;}
  const scope=await currentScope(trx,host,row.installation_id,at);
  if(!scope?.valid||scope.unavailable||!['healthy','warning'].includes(row.state)||!row.assessment)fail('maintenance_health_baseline',409);
  const observation=row.facts.package as {observation_id:string|null};
  if(!observation.observation_id)fail('maintenance_health_baseline',409);
  const subjects=(row.assessment.subjects??[]).map(s=>{
   if(s.status!=='healthy'&&s.status!=='warning')fail('maintenance_health_baseline',409);
   return {collection:s.collection,key:s.key,status:s.status};
  });
  members.push({installation_id:row.installation_id,package_sha256:row.content_sha256,settings_revision:row.source_revision,
   scope_sha256:contextKey(scope.scope),observation_id:observation.observation_id,severity:row.state as 'healthy'|'warning',subjects});
 }
 members.sort((a,b)=>a.installation_id.localeCompare(b.installation_id));not_configured.sort();
 return {policy_sha256:maintenanceDigest(policy(projections)),members,not_configured};
}
