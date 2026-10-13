/** Local administration uses the same verified acquisition/confirmation path as the UI. */
import {randomUUID} from "node:crypto";
import {createDb} from "../server/db/client";
import {parseDatabaseUrl} from "../server/config";
import {assertDatabaseTarget} from "../server/db/target";
import {requireCurrentLedger} from "../server/db/ledger";
import {localAdministrator} from "../server/access/scope";
import {newCredential} from "../server/validation";
import {officialRepository} from "../lib/skills/repositories";
import {refreshRepository} from "../server/skills/repositories/catalog";
import {prepareRepositoryPackage,commitRepositoryPackage} from "../server/skills/repositories/preparation";
const existing:Record<string,string>={
 "tinywarden/disk-local":"85508ff4165dc45bdbaecd4fd9e781b43e7b29d654ee0ab33a041f7d16c71642",
 "tinywarden/fstrim-status":"d0f0b132e2a138884f1d390f8ee77cd7d3211a83730ff71e49894fb855972d11",
 "tinywarden/package-updates":"dbf7eacb1fc56e09d35fb2543e160966bbf4e71477b40e7a3742677983545f8f",
 "tinywarden/reboot-required":"e2de01bd80772f832b5d13c80e1f856d3b9131f9d5d34678fedefb4392fd4043"};
async function main(){
 const [expected,action,...extra]=process.argv.slice(2);if(!expected||action!=="adopt-official"||extra.length)throw Error("usage");
 const db=createDb(parseDatabaseUrl(process.env.DATABASE_URL,"tinywarden")),credential=newCredential("session"),clock=()=>new Date();
 try{
  await assertDatabaseTarget(db,expected);await requireCurrentLedger(db);
  await db.transaction().execute(async trx=>{const actor=await localAdministrator(trx),at=clock();await trx.insertInto("operator_sessions").values({id:credential.id,operator_id:actor.id,secret_digest:credential.digest,auth_version:actor.auth_version,issued_at:at,last_seen_at:at,expires_at:new Date(+at+600000)}).execute();});
  let repo=await db.selectFrom("skill_repositories").selectAll().where("id","=",officialRepository.key).executeTakeFirstOrThrow();
  if(!repo.catalogue||repo.error||!repo.verified_at||Date.now()-repo.verified_at.getTime()>86400000){await refreshRepository(db,credential.value,repo.id,{request_id:randomUUID(),expected_revision:repo.revision},clock);repo=await db.selectFrom("skill_repositories").selectAll().where("id","=",repo.id).executeTakeFirstOrThrow();}
  if(repo.error||!repo.catalogue)throw Error("official_catalogue_unavailable");let connected=0;
  for(const [skillId,expectedDigest] of Object.entries(existing)){
   const installation=await db.selectFrom("skill_installations").selectAll().where("skill_id","=",skillId).executeTakeFirst();if(!installation)continue;
   const source=await db.selectFrom("skill_installation_sources").selectAll().where("installation_id","=",installation.id).executeTakeFirst();if(source?.kind==="repository"){if(source.repository_id!==repo.id)throw Error("source_conflict");continue;}
   const offer=repo.catalogue.skills.find(v=>v.id===skillId),artifact=await db.selectFrom("skill_packages").selectAll().where("content_sha256","=",installation.content_sha256).executeTakeFirstOrThrow();
   if(!offer||offer.content_sha256!==expectedDigest||installation.content_sha256!==expectedDigest||!artifact.official||artifact.version!==offer.version)throw Error("existing_package_mismatch");
   const result=await prepareRepositoryPackage(db,credential.value,{request_id:randomUUID(),repository_id:repo.id,skill_id:skillId,content_sha256:expectedDigest,catalogue_revision:repo.catalogue_revision},clock);
   const prepared=result as unknown as {preparation:{id:string;metadata:typeof artifact.metadata}|null;error:string|null};if(!prepared.preparation||prepared.error)throw Error("official_preparation_failed");
   await commitRepositoryPackage(db,credential.value,{request_id:randomUUID(),preparation_id:prepared.preparation.id,content_sha256:expectedDigest,grants:prepared.preparation.metadata.manifest.capabilities},clock);
   const after=await db.selectFrom("skill_installations").selectAll().where("id","=",installation.id).executeTakeFirstOrThrow();if(JSON.stringify(after)!==JSON.stringify(installation))throw Error("source_adoption_changed_installation");connected++;
  }
  console.log(JSON.stringify({connected}));
 }finally{await db.deleteFrom("operator_sessions").where("id","=",credential.id).execute();await db.destroy();}
}
main().catch(()=>{process.stderr.write("skill_repository_administration_failed\n");process.exitCode=1;});
