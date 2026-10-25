import type {Kysely} from 'kysely';
import type {Database} from '../db/types';
import {authorizeAgent} from '../fleet/agent-authority';
import {accessGate} from '../access/scope';
import {collectionReadRoot} from '../fleet/management';
import {packageTransfer,readPackageArchive} from '../skills/runtime/artifact-download';
import {packageStore} from '../skills/runtime/storage';
import {preparationAuthority} from './authority';
import {uuid} from '../validation';
import {fail} from '../errors';

/** Exact job package only. Download never grants execution or changes freshness. */
export function downloadActionPackage(db:Kysely<Database>,credential:string,id:string,clock:()=>Date,store=packageStore){
 id=uuid(id);return packageTransfer(async()=>db.transaction().execute(async trx=>{
  await accessGate(trx);await collectionReadRoot(trx);
  const {host,agent,now}=await authorizeAgent(trx,credential,clock);
  const job=await trx.selectFrom('maintenance_jobs').selectAll().where('id','=',id).where('host_id','=',host.id)
   .where('agent_id','=',agent.id).where('generation','=',agent.current_generation).forUpdate().executeTakeFirst();
  if(!job?.action_binding||!job.content_sha256||!job.action_archive||job.completed_at&&!job.attention)fail('maintenance_job_unknown',409);
  if(!job.apply_attempt){if(job.expires_at<=now)fail('maintenance_expired',409);await preparationAuthority(trx,job,now);}
  return readPackageArchive(job.content_sha256,job.action_archive,store);
 }));
}
