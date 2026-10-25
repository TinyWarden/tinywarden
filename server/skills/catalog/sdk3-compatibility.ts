import type {Transaction} from 'kysely';
import type {Database} from '../../db/types';
import type {PackageMetadata} from '../../../lib/skills/package-types';
import {fail} from '../../errors';

/** Hold activation, keeping the selected older monitor intact until its scope is ready. */
export async function assertSDK3Scope(trx:Transaction<Database>,metadata:PackageMetadata,at:Date){
 if(metadata.manifest.sdk!==3)return;
 const hosts=await trx.selectFrom('hosts as h').innerJoin('agents as a','a.host_id','h.id')
  .leftJoin('skill_runtime_hosts as r',j=>j.onRef('r.agent_id','=','a.id').onRef('r.generation','=','a.current_generation'))
  .select(['h.id','r.sdk3_support','r.reported_at']).where('h.lifecycle','in',['active','paused'])
  .where('h.os_id','=','debian').where('h.os_version','=','13').where('h.architecture','in',metadata.manifest.compatibility.architectures)
  .where('a.revoked_at','is',null).execute();
 if(hosts.some(h=>!h.sdk3_support||!h.reported_at||h.reported_at>at||+at-+h.reported_at>300000))fail('maintenance_sdk3_scope_unsupported',409);
}
