import { randomUUID } from "node:crypto";
import path from "node:path";
import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import { assertDatabaseTarget } from "../server/db/target";
import { requireCurrentLedger } from "../server/db/ledger";
import { newCredential } from "../server/validation";
import { importSkillDirectory } from "../server/skills/catalog/package-install";
import { importLegacySkills } from "../server/skills/catalog/legacy-import";
import { setPackageEnabled } from "../server/skills/catalog/package-controls";
import { selectPackageVersion } from "../server/skills/catalog/package-version";

// Privileged native administration, like the local password-reset command.
// The temporary authorization never leaves this process and is removed in finally.
async function main(){
  const [expected,action,first,second,flag,extra]=process.argv.slice(2);
  if(!expected||!action||!first||extra||!["import","migrate-legacy","enable","disable","select-version"].includes(action))throw new Error("usage");
  if(action==="import"?(second!==undefined&&second!=="--official"||flag!==undefined):action==="migrate-legacy"?(second!==undefined):(!second||flag!==(action==="disable"?undefined:"--approve-declared-grants")))throw new Error("usage");
  const db=createDb(parseDatabaseUrl(process.env.DATABASE_URL,"tinywarden"));const session=newCredential("session");
  try{
    await assertDatabaseTarget(db,expected);await requireCurrentLedger(db);
    const at=new Date();
    const operator=await db.selectFrom("operators").select(["id","auth_version"]).executeTakeFirstOrThrow();
    await db.insertInto("operator_sessions").values({id:session.id,operator_id:operator.id,secret_digest:session.digest,
      auth_version:operator.auth_version,issued_at:at,last_seen_at:at,expires_at:new Date(at.getTime()+10*60000)}).execute();
    let result:unknown;
    if(action==="import")result=await importSkillDirectory(db,session.value,{request_id:randomUUID(),directory:path.resolve(first),official:second==="--official"},()=>new Date());
    else if(action==="migrate-legacy")result=await importLegacySkills(db,session.value,{request_id:randomUUID(),directories:
      Object.fromEntries(["disk-local","package-updates","reboot-required","fstrim-status"].map((key)=>[key,path.join(path.resolve(first),key)]))},()=>new Date());
    else{
      const installation=await db.selectFrom("skill_installations").selectAll().where("id","=",first).executeTakeFirstOrThrow();
      const artifact=await db.selectFrom("skill_packages").selectAll().where("content_sha256","=",second!).executeTakeFirstOrThrow();
      const input={request_id:randomUUID(),expected_enablement_version:installation.enablement_version,content_sha256:second!,grants:artifact.metadata.manifest.capabilities};
      result=action==="select-version"?await selectPackageVersion(db,session.value,first,input,()=>new Date()):await setPackageEnabled(db,session.value,first,{...input,enabled:action==="enable"},()=>new Date());
    }
    process.stdout.write(JSON.stringify(result)+"\n");
  }finally{await db.deleteFrom("operator_sessions").where("id","=",session.id).execute();await db.destroy();}
}
main().catch(()=>{process.stderr.write("skill_admin_failed\n");process.exitCode=1;});
