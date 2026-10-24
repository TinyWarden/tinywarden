import {createDb} from '../server/db/client';
import {parseDatabaseUrl} from '../server/config';
import {assertDatabaseTarget} from '../server/db/target';
import {requireCurrentLedger} from '../server/db/ledger';
import {sweepMaintenance} from '../server/maintenance/sweep';
import messages from '../messages/en.json';
async function main(){
 const [flag,expected,extra]=process.argv.slice(2);
 if(flag!=='--expected-database'||!expected||extra)throw new Error('invalid_arguments');
 const db=createDb(parseDatabaseUrl(process.env.DATABASE_URL,'tinywarden'));
 try{
  await assertDatabaseTarget(db,expected,false);await requireCurrentLedger(db);
  const checked=await sweepMaintenance(db);process.stdout.write(JSON.stringify({checked})+'\n');
 }finally{await db.destroy();}
}
main().catch(()=>{process.stderr.write(messages.maintenanceJobsCli.failed+'\n');process.exitCode=1;});
