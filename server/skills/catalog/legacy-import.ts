import { randomUUID } from "node:crypto";
import type { Transaction } from "kysely";
import type { Database } from "../../db/types";
import type { PackageMetadata, SkillSettings } from "../../../lib/skills/package-types";
import { matchesSchema } from "../../../lib/skills/schema-values";
import { publishPackage } from "../runtime/storage";
import { validateSettings } from "../settings/package-validation";
import { savedOverrides, diskFields, baselineFields } from "../settings/field-overrides";
import { parseFstrimContext } from "../legacy/trim/context";
import { lockBaselineDefinitions } from "../legacy/shared/locks";
import { lockedDefinition } from "../settings/disk";
import { authorize, completeAuthorization } from "../../access/session";
import { jsonValue } from "../../db/json";
import { fail } from "../../errors";
import { uuid } from "../../validation";
import { packageLock, canonicalText, commandFingerprint, mutationReplay, recordMutation, type PackageDb } from "./package-commands";

const aliases = ["disk-local", "package-updates", "reboot-required", "fstrim-status"] as const;
async function snapshot(trx: Transaction<Database>, at: Date, exclusive=false) {
  const disk = await lockedDefinition(trx,exclusive);
  const baselines = await lockBaselineDefinitions(trx,exclusive?"all":undefined);
  const diskPolicies = await trx.selectFrom("host_check_policies as h").innerJoin("host_check_policy_revisions as r", (j) =>
    j.onRef("r.host_id","=","h.host_id").onRef("r.definition_key","=","h.definition_key").onRef("r.version","=","h.current_policy_version"))
    .selectAll("r").where("h.definition_key","=","disk-local").orderBy("r.host_id").limit(501).execute();
  const policies = await trx.selectFrom("baseline_policies as h").innerJoin("baseline_policy_revisions as r",(j) =>
    j.onRef("r.host_id","=","h.host_id").onRef("r.definition_key","=","h.definition_key").onRef("r.version","=","h.current_policy_version"))
    .selectAll("r").orderBy("r.host_id").orderBy("r.definition_key").limit(1501).execute();
  if (diskPolicies.length > 500 || policies.length > 1500) fail("temporarily_unavailable",503);
  const definitions = [{ key: "disk-local", head: disk.head,
    defaults: { warning_percent: disk.current.warning_percent, critical_percent: disk.current.critical_percent, interval_seconds: disk.current.interval_seconds },
    policies: diskPolicies.map((p) => ({ host: p.host_id, version: p.version, overrides: savedOverrides(diskFields,p,p) as SkillSettings })) },
    ...baselines.map((b) => { const fields=baselineFields(b.key);return { key:b.key,head:b.head,
      defaults:Object.fromEntries(fields.map((k) => [k,b.current[k as keyof typeof b.current]])) as SkillSettings,
      policies:policies.filter((p) => p.definition_key===b.key).map((p) => ({host:p.host_id,version:p.version,overrides:savedOverrides(fields,p,p) as SkillSettings})) }; })];
  const runs = await trx.selectFrom("baseline_runs as r").innerJoin("agents as a", "a.id", "r.agent_id")
    .selectAll("r").where("r.definition_key","=","fstrim-status").whereRef("r.generation","=","a.current_generation")
    .where("r.received_at",">=",new Date(at.getTime()-90*86400000)).orderBy("r.agent_id").orderBy("r.run_sequence","desc").limit(30001).execute();
  if (runs.length>30000) fail("temporarily_unavailable",503);
  const seen=new Set<string>();const contexts=runs.filter((r) => {if(seen.has(r.agent_id))return false;seen.add(r.agent_id);return true;}).flatMap((r) => {
    const c=parseFstrimContext(r.fstrim_context);if(!c)return [];
    const state:Record<string,unknown>={as_of:c.as_of};
    for (const key of ["expected_at","last_trigger","covered_trigger"] as const) if(c[key]!==null)state[key]=c[key];
    const e=c.last_execution;
    if(e && Date.parse(e.recorded_at)>=at.getTime()-90*86400000) {
      const last:Record<string,unknown>={observed_at:e.observed_at,recorded_at:Date.parse(e.recorded_at),outcome:e.outcome};
      for(const key of ["started_at","finished_at","trigger_at"] as const)if(e[key]!==null)last[key]=e[key];
      state.last_execution=last;
    }
    return [{source:r.id,host:r.host_id,agent:r.agent_id,generation:r.generation,finished:r.finished_at,received:r.received_at,state}];
  });
  return {definitions,contexts};
}
/** One explicit conversion of legacy heads, field intent and retained trim context. */
export async function importLegacySkills(db:PackageDb,cookie:string,input:{request_id:string;directories:Record<string,string>},clock:()=>Date,store?:string) {
  const request=uuid(input.request_id);
  const original=await db.transaction().setIsolationLevel("repeatable read").execute(async(trx)=>{
    const actor=await authorize(trx,cookie,clock);const state=await snapshot(trx,actor.at);
    await completeAuthorization(trx,actor,clock());return state;
  });
  const metadata=new Map<string,PackageMetadata>();
  for(const alias of aliases){
    const directory=input.directories[alias];if(!directory)fail("invalid_request",400);
    const m=await publishPackage(directory,true,store);
    if(m.manifest.alias!==alias||m.manifest.id!==`tinywarden/${alias}`)fail("invalid_request",400);
    const definition=original.definitions.find((d)=>d.key===alias)!;
    await validateSettings(m,true,definition.defaults,store);
    for(const p of definition.policies)await validateSettings(m,true,{...definition.defaults,...p.overrides},store);
    if(alias==="fstrim-status"&&original.contexts.some((c)=>!matchesSchema(m.schemas.state,c.state)))fail("invalid_request",400);
    metadata.set(alias,m);
  }
  const fp=commandFingerprint("legacy_import",[...metadata].map(([key,m])=>[key,m.content_sha256]));
  return db.transaction().execute(async(trx)=>{
    await packageLock(trx);const actor=await authorize(trx,cookie,clock);
    const replay=await mutationReplay(trx,actor.operatorId,request,fp);if(replay)return replay;
    const current=await snapshot(trx,actor.at,true);
    if(canonicalText(current)!==canonicalText(original))fail("settings_conflict",409);
    if(await trx.selectFrom("skill_installations").select("id").where("skill_id","in",aliases.map((a)=>`tinywarden/${a}`)).executeTakeFirst())fail("already_imported",409);
    const imported=[];
    for(const alias of aliases){
      const m=metadata.get(alias)!,d=current.definitions.find((row)=>row.key===alias)!,id=randomUUID();
      await trx.insertInto("skill_packages").values({content_sha256:m.content_sha256,skill_id:m.manifest.id,version:m.manifest.version,
        metadata:m,unpacked_bytes:m.size,official:true,imported_at:actor.at}).onConflict((oc)=>oc.column("content_sha256").doNothing()).execute();
      await trx.insertInto("skill_installations").values({id,skill_id:m.manifest.id,subject_key:alias,content_sha256:m.content_sha256,
        enabled:d.head.enabled,enablement_version:d.head.enablement_version,settings_revision:d.head.current_revision,defaults:d.defaults,
        grants:jsonValue(m.manifest.capabilities),created_at:actor.at,updated_at:actor.at}).execute();
      await trx.insertInto("skill_settings_revisions").values({installation_id:id,revision:d.head.current_revision,
        content_sha256:m.content_sha256,settings:d.defaults,operator_id:actor.operatorId,created_at:actor.at}).execute();
      for(const p of d.policies)if(Number(p.version)>0){
        const values={host_id:p.host,installation_id:id,version:p.version,overrides:p.overrides,updated_at:actor.at};
        await trx.insertInto("host_skill_policies").values(values).execute();
        await trx.insertInto("host_skill_policy_revisions").values({...values,operator_id:actor.operatorId}).execute();
      }
      if(alias==="fstrim-status")for(const c of current.contexts)await trx.insertInto("skill_states").values({installation_id:id,
        agent_id:c.agent,host_id:c.host,generation:c.generation,content_sha256:m.content_sha256,enablement_version:d.head.enablement_version,
        state_version:m.manifest.state_version,last_sequence:"0",finished_at:c.finished,observation_id:c.source,state:c.state,updated_at:c.received}).execute();
      imported.push({installation_id:id,key:alias,content_sha256:m.content_sha256,enabled:d.head.enabled,
        settings_revision:d.head.current_revision,policies:d.policies.length,trim_contexts:alias==="fstrim-status"?current.contexts.length:0});
    }
    await completeAuthorization(trx,actor,clock());
    const result={imported};
    await recordMutation(trx,actor.operatorId,request,"legacy_import",imported[0]!.installation_id,fp,actor.at,result);
    return result;
  });
}
