import { authorize, completeAuthorization } from '../access/session';
import { requireAdmin } from '../access/scope';
import { issueToken } from './tokens';
import { setupCode } from '../agent-updates/setup';
import { exactObject, label, uuid } from '../validation';
import { ids, tags, revision, type FleetDb } from './management';
import {setupActivity,activityOptions} from './activity';
import { fail } from '../errors';

export async function createFleetSetup(db:FleetDb,cookie:string,raw:Record<string,unknown>,origin:string,clock:()=>Date){
 exactObject(raw,['request_id','mode','label','target_host_id','expected_revision','groups','tags']);
 const request=uuid(raw.request_id),mode=raw.mode;if(mode!=='new'&&mode!=='replace'&&mode!=='restore')fail('invalid_request',400);
 const groups=ids(raw.groups),labels=tags(raw.tags);let target:string|null=null,name=label(raw.label),expected:string|null=null;
 if(mode==='new'){if(raw.target_host_id!==null||raw.expected_revision!==null)fail('invalid_request',400);}
 else{
  const host=uuid(raw.target_host_id);expected=revision(raw.expected_revision);if(groups.length||labels.length)fail('invalid_request',400);
  const result=await db.transaction().execute(async trx=>{
    const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
    const row=await trx.selectFrom('hosts as h').innerJoin('agents as a','a.host_id','h.id').select(['h.label','a.id']).where('h.id','=',host).executeTakeFirst();
    if(!row)fail('not_found',404);await completeAuthorization(trx,actor,clock());return row;
  });target=result.id;name=result.label;
 }
 const result=await issueToken(db,cookie,{requestId:request,label:name,targetAgentId:target,
   fleetIntent:{purpose:mode,revision:expected,...(mode==='new'?{groups,tags:labels}:{})}},clock);
 return {token_id:result.token_id,setup_code:setupCode(origin,result.token),expires_at:result.expires_at};
}
export async function listFleetSetups(db:FleetDb,cookie:string,clock:()=>Date,search=''){return setupActivity(db,cookie,activityOptions(search,'setups'),clock);}
