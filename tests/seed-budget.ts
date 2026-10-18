import {sql,type Kysely} from 'kysely';
import type {Database} from '../server/db/types';
// Captured-data expansion only; runtime ingestion limits remain enforced.
export async function refillFixtureBudget(db:Kysely<Database>,agent:string){
 const result=await sql<{name:string}>`SELECT current_database() AS name`.execute(db);
 if(result.rows[0]?.name!=='tinywarden_test_p1b')throw Error('test_database_required');
 await sql`UPDATE tinywarden.agent_storage_budgets SET result_tokens=256,result_at=clock_timestamp() WHERE agent_id=${agent}::uuid`.execute(db);
}
