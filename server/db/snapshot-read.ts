import {setTimeout as delay} from "node:timers/promises";
import type {Kysely,Transaction} from "kysely";
import type {Database} from "./types";

/** Session renewal can invalidate another repeatable-read snapshot. Only retry
 * rolled-back read roots, never domain writes or external side effects. */
export async function snapshotRead<T>(db:Kysely<Database>,action:(trx:Transaction<Database>)=>Promise<T>):Promise<T>{
  for(let attempt=0;attempt<5;attempt++){
    try{return await db.transaction().setIsolationLevel("repeatable read").execute(action);}
    catch(error){
      const code=error&&typeof error==="object"&&"code" in error?error.code:null;
      if(attempt===4||code!=="40001"&&code!=="40P01")throw error;
      await delay(5*2**attempt+Math.floor(Math.random()*10));
    }
  }
  throw new Error("snapshot_read_unavailable");
}
