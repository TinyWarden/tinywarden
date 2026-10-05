import { authorize, completeAuthorization } from "../../access/session";
import { fail } from "../../errors";
import { uuid } from "../../validation";
import { jsonValue } from "../../db/json";
import { validateSettings } from "../settings/package-validation";
import { packageLock, installed, nextCounter, authorizedReplay, mutationReplay, recordMutation, commandFingerprint, canonicalText, packageRead, type PackageDb } from "./package-commands";

export async function readPackageVersions(db:PackageDb,cookie:string,rawId:string,clock:()=>Date,digest?:string){
  const id=uuid(rawId);
  if(digest!==undefined&&!/^[0-9a-f]{64}$/.test(digest))fail("invalid_request",400);
  return packageRead(db,async(trx)=>{
    const actor=await authorize(trx,cookie,clock);
    const {installation,artifact}=await installed(trx,id);
    const rows=await trx.selectFrom("skill_packages").select(["content_sha256","version","metadata","official","imported_at"])
      .where("skill_id","=",installation.skill_id).orderBy("imported_at","desc").limit(100).execute();
    const versions=rows.filter((p)=>digest===undefined||p.content_sha256===digest).map((p)=>({content_sha256:p.content_sha256,version:p.version,
      publisher:p.metadata.manifest.publisher,...(digest?{metadata:p.metadata}:{}),selected:p.content_sha256===installation.content_sha256,
      compatible:p.official===artifact.official && p.metadata.manifest.alias===artifact.metadata.manifest.alias &&
        canonicalText(p.metadata.schemas.settings)===canonicalText(artifact.metadata.schemas.settings)}));
    if(digest&&!versions.length)fail("not_found",404);
    await completeAuthorization(trx,actor,clock());return {as_of:actor.at.toISOString(),versions};
  });
}

/** Select only an admitted immutable version, with fresh digest-specific grant approval. */
export async function selectPackageVersion(db:PackageDb,cookie:string,rawId:string,input:{request_id:string;
  content_sha256:string;expected_enablement_version:string;grants:Record<string,unknown>[]},clock:()=>Date,store?:string){
  const id=uuid(rawId),request=uuid(input.request_id),fp=commandFingerprint("version",id,input);
  const replay=await authorizedReplay(db,cookie,request,fp,clock);if(replay)return replay;
  const {installation,artifact}=await installed(db,id);
  const next=await db.selectFrom("skill_packages").selectAll().where("content_sha256","=",input.content_sha256).executeTakeFirst();
  if(!next||next.skill_id!==installation.skill_id||next.official!==artifact.official||next.metadata.manifest.alias!==artifact.metadata.manifest.alias||
    canonicalText(next.metadata.schemas.settings)!==canonicalText(artifact.metadata.schemas.settings)||
    canonicalText(input.grants)!==canonicalText(next.metadata.manifest.capabilities))fail("incompatible_package_version",409);
  const policies=await db.selectFrom("host_skill_policies").selectAll().where("installation_id","=",id).orderBy("host_id").limit(501).execute();
  if(policies.length>500)fail("temporarily_unavailable",503);
  await validateSettings(next.metadata,next.official,installation.defaults,store);
  for(const p of policies)await validateSettings(next.metadata,next.official,{...installation.defaults,...p.overrides},store);
  return db.transaction().execute(async(trx)=>{
    await packageLock(trx);const actor=await authorize(trx,cookie,clock);
    const saved=await mutationReplay(trx,actor.operatorId,request,fp);if(saved)return saved;
    const current=await trx.selectFrom("skill_installations").selectAll().where("id","=",id).forUpdate().executeTakeFirstOrThrow();
    const heads=await trx.selectFrom("host_skill_policies").selectAll().where("installation_id","=",id).orderBy("host_id").limit(501).execute();
    if(current.content_sha256!==artifact.content_sha256||current.settings_revision!==installation.settings_revision||
      current.enablement_version!==input.expected_enablement_version||canonicalText(heads)!==canonicalText(policies))fail("settings_conflict",409);
    const changed=current.content_sha256!==next.content_sha256;
    const version=changed?nextCounter(current.enablement_version):current.enablement_version;
    if(changed){
      const revision=nextCounter(current.settings_revision);
      await trx.insertInto("skill_settings_revisions").values({installation_id:id,revision,content_sha256:next.content_sha256,
        settings:current.defaults,operator_id:actor.operatorId,created_at:actor.at}).execute();
      await trx.updateTable("skill_installations").set({content_sha256:next.content_sha256,enablement_version:version,settings_revision:revision,
        grants:jsonValue(input.grants),updated_at:actor.at}).where("id","=",id).execute();
      // Previous raw observations/catalogs remain immutable; state cannot cross package identities.
      await trx.deleteFrom("skill_states").where("installation_id","=",id).execute();
    }
    const result={installation_id:id,content_sha256:next.content_sha256,enablement_version:version,changed};
    await completeAuthorization(trx,actor,clock());await recordMutation(trx,actor.operatorId,request,"version",id,fp,actor.at,result);return result;
  });
}
