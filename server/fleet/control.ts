import type { Kysely, Selectable, Transaction } from 'kysely';
import type { Database, Hosts } from '../db/types';
import { authorizeAgent } from './agent-authority';
import { recordAgentContact } from './contact-evidence';
import { exactObject } from '../validation';
import { fail } from '../errors';

export const monitoringCapability='monitoring_control.v1';
export const monitoringLeaseSeconds=300;
export function epoch(value:unknown):string {
  if(typeof value!=='string'||! /^[1-9][0-9]{0,15}$/.test(value)||!Number.isSafeInteger(Number(value)))fail('invalid_request',400);
  return value;
}
export function controlInput(raw:Record<string,unknown>){
  if(!Array.isArray(raw.capabilities)||raw.capabilities.length!==1||raw.capabilities[0]!==monitoringCapability)fail('invalid_request',400);
  let applied:{epoch:string;mode:'active'|'paused'}|null=null;
  if(raw.applied!==null){const a=exactObject(raw.applied,['epoch','mode']);if(a.mode!=='active'&&a.mode!=='paused')fail('invalid_request',400);applied={epoch:epoch(a.epoch),mode:a.mode};}
  return {applied};
}
export function currentCollection(host:Pick<Selectable<Hosts>,'lifecycle'|'monitoring_epoch'>,assignment:{monitoring_epoch:string}) {
  return host.lifecycle==='active'&&host.monitoring_epoch===assignment.monitoring_epoch;
}
export async function controlPoll(db:Kysely<Database>,credential:string,input:ReturnType<typeof controlInput>,clock:()=>Date){
  return db.transaction().execute(async trx=>{
    const scope=await authorizeAgent(trx,credential,clock),{host,agent,now}=scope;
    const mode=host.lifecycle==='active'?'active' as const:'paused' as const;
    const prior=await trx.selectFrom('fleet_agent_control').selectAll().where('agent_id','=',agent.id).executeTakeFirst();
    if(prior?.generation===agent.current_generation&&now<prior.reported_at)fail('temporarily_unavailable',503);
    const a=input.applied;
    if(a&&(Number(a.epoch)>Number(host.monitoring_epoch)||a.epoch===host.monitoring_epoch&&a.mode!==mode))fail('control_conflict',409);
    const applied=a?.epoch===host.monitoring_epoch?a.epoch:prior?.generation===agent.current_generation?prior.applied_epoch:null;
    const values={agent_id:agent.id,generation:agent.current_generation,reported_at:now,
      applied_epoch:applied,applied_at:a?.epoch===host.monitoring_epoch?now:prior?.generation===agent.current_generation?prior.applied_at:null};
    await trx.insertInto('fleet_agent_control').values(values).onConflict(oc=>oc.column('agent_id').doUpdateSet(values)).execute();
    await recordAgentContact(trx,scope);
    return {host_id:host.id,agent_id:agent.id,generation:agent.current_generation,epoch:host.monitoring_epoch,
      mode,issued_at:now.toISOString(),valid_until:new Date(+now+monitoringLeaseSeconds*1000).toISOString(),poll_interval_seconds:60};
  });
}
export async function fleetHostLock(trx:Transaction<Database>,id:string){
  return trx.selectFrom('hosts').selectAll().where('id','=',id).forUpdate().executeTakeFirst();
}
