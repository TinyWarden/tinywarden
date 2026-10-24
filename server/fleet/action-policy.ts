import type {Selectable,Transaction} from 'kysely';
import type {Database,Hosts} from '../db/types';
import {fleetActionReason,maintenancePhase,type FleetAction} from '../../lib/fleet-actions';
import {activeAgentUpdate} from '../agent-updates/requests';
import {fail} from '../errors';
import {assertLifecycleSafe,activeMaintenance} from '../maintenance/fencing';

/** Caller holds the host lock. Never substitute a browser's eligibility snapshot. */
export async function assertFleetAction(trx:Transaction<Database>,host:Pick<Selectable<Hosts>,'id'|'lifecycle'>,action:FleetAction,at:Date) {
  if(['reconnect','archive','delete'].includes(action))await assertLifecycleSafe(trx,host.id);
  if(action==='pause'){
    const job=await activeMaintenance(trx,host.id);
    if(job&&(job.attention||job.apply_attempt||job.phase==='verifying'))fail('maintenance_reconciliation_required',409);
  }
  const window=action.endsWith('Maintenance')||action==='maintenance' ? await trx.selectFrom('fleet_maintenance').select(['starts_at','ends_at']).where('host_id','=',host.id).where('closed_at','is',null).executeTakeFirst() : undefined;
  const control=action==='pause' ? await trx.selectFrom('fleet_agent_control as c').innerJoin('agents as a','a.id','c.agent_id').select('c.agent_id').where('a.host_id','=',host.id).whereRef('c.generation','=','a.current_generation').where('a.revoked_at','is',null).executeTakeFirst() : undefined;
  const busy=action==='reconnect' ? await activeAgentUpdate(trx,host.id,at) : false;
  const reason=fleetActionReason(action,{lifecycle:host.lifecycle,control_supported:!!control,maintenance:maintenancePhase(window,at),update:{available:false,reason:null,in_progress:busy}});
  if(reason)fail(reason,409);
}
