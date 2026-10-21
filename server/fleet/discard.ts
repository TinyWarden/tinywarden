import type { Transaction } from 'kysely';
import type { Database } from '../db/types';
import type { authorizeAgent } from './agent-authority';
import { fail } from '../errors';
import { recordAgentContact } from './contact-evidence';

type Scope=Awaited<ReturnType<typeof authorizeAgent>>;
export async function discardPackage(trx:Transaction<Database>,scope:Scope,input:{run_id:string;run_sequence:number},digest:Buffer,
  assignment:{id:string;installation_id:string}){
  const used=await trx.selectFrom('skill_package_receipts').select('run_id').where('agent_id','=',scope.agent.id)
    .where('generation','=',scope.agent.current_generation).where('installation_id','=',assignment.installation_id)
    .where('run_sequence','=',String(input.run_sequence)).executeTakeFirst();
  if(used)fail('sequence_conflict',409);
  const receipt=await trx.insertInto('skill_package_receipts').values({agent_id:scope.agent.id,generation:scope.agent.current_generation,
    installation_id:assignment.installation_id,run_sequence:input.run_sequence,run_id:input.run_id,assignment_id:assignment.id,
    request_digest:digest,received_at:scope.now,current:false}).returningAll().executeTakeFirstOrThrow();
  await recordAgentContact(trx,scope);return receipt;
}
export async function discardLegacy(trx:Transaction<Database>,scope:Scope,family:'disk'|'baseline',
  input:{run_id:string;run_sequence:number},digest:Buffer,assignment:{id:string;definition_key:string}){
  const values={id:input.run_id,host_id:scope.host.id,agent_id:scope.agent.id,generation:scope.agent.current_generation,
    run_sequence:input.run_sequence,assignment_id:assignment.id,received_at:scope.now,request_digest:digest};
  if(family==='disk')await trx.insertInto('disk_run_receipts').values(values).execute();
  else await trx.insertInto('baseline_run_receipts').values({...values,definition_key:assignment.definition_key}).execute();
  await recordAgentContact(trx,scope);
  return {run_id:input.run_id,run_sequence:input.run_sequence,received_at:scope.now.toISOString(),duplicate:false};
}
