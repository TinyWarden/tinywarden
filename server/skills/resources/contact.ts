import type {Transaction} from "kysely";
import type {Database} from "../../db/types";
import {contactState} from "../../fleet/contact";
import {agentContactAt} from "../../fleet/contact-evidence";
export async function resourceContact(trx:Transaction<Database>,host:string,at:Date){
 const agent=await trx.selectFrom('agents').selectAll().where('host_id','=',host).executeTakeFirst();
 if(!agent)return {agent:undefined,current:false};
 const credential=await trx.selectFrom('agent_credentials').selectAll().where('agent_id','=',agent.id).where('generation','=',agent.current_generation).executeTakeFirst();
 return {agent,current:!!credential&&!credential.revoked_at&&contactState(agent.revoked_at,agentContactAt(credential),agent.stale_after_seconds,at)==='current'};
}
