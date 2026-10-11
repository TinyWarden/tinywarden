import {createDb} from "../server/db/client";
import {parseDatabaseUrl} from "../server/config";
import {assertDatabaseTarget} from "../server/db/target";
import {requireCurrentLedger} from "../server/db/ledger";
import {refreshCatalog} from "../server/agent-updates/catalog";
async function main(){
  const [flag,expected,extra]=process.argv.slice(2);if(flag!=="--expected-database"||!expected||extra)throw new Error("invalid_arguments");
  const url=parseDatabaseUrl(process.env.DATABASE_URL,"tinywarden"),db=createDb(url);
  try{await assertDatabaseTarget(db,expected,false);await requireCurrentLedger(db);const result=await refreshCatalog(db);process.stdout.write(JSON.stringify(result)+"\n");if(!result.complete)process.exitCode=1;}finally{await db.destroy();}
}
main().catch(()=>{process.stderr.write("Agent release catalogue check failed.\n");process.exitCode=1;});
