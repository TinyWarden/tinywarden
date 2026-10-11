import type {Kysely} from "kysely";
import type {Database} from "../db/types";
import {authorizeAgent} from "../fleet/agent-authority";
import {fail} from "../errors";
import {uuid} from "../validation";
import {settings} from "./policy";
import {readCatalog,freshCatalog} from "./catalog";
import {capability,closed,compatible,supports} from "./release";
import {observation} from "./status";
function counter(v:unknown){if(!Number.isSafeInteger(v)||Number(v)<1)fail("invalid_request",400);return String(v);}
function scope(raw:unknown,fields:string[]){
  try {const v=closed(raw,["schema_version","host_id","agent_id","generation",...fields]);if(v.schema_version!==1)fail("unsupported_version",400);return {...v,host_id:uuid(v.host_id),agent_id:uuid(v.agent_id),generation:counter(v.generation)};}
  catch {fail("invalid_request",400);}
}
export async function updatePolicy(db:Kysely<Database>,credential:string,raw:unknown,clock=()=>new Date()){
  const v=scope(raw,["version","managed"]) as Record<string,unknown>&{host_id:string;agent_id:string;generation:string};
  if(typeof v.version!=="string"||!/^[A-Za-z0-9.+-]{1,64}$/.test(v.version)||typeof v.managed!=="boolean")fail("invalid_request",400);
  return db.transaction().execute(async trx=>{
    const a=await authorizeAgent(trx,credential,clock);if(a.host.id!==v.host_id||a.agent.id!==v.agent_id||a.agent.current_generation!==v.generation)fail("unauthorized",401);
    const [s,c,r]=await Promise.all([settings(trx,a.host.id),readCatalog(trx),trx.selectFrom("agent_platform_reports").selectAll().where("agent_id","=",a.agent.id).where("generation","=",a.agent.current_generation).executeTakeFirst()]);
    const candidate=c.releases.find(r=>supports(r.metadata)&&compatible(r.metadata,v.version as string));
    const allowed=v.managed&&s.effective&&freshCatalog(c,a.now)&&a.host.os_id==="debian"&&a.host.os_version==="13"&&a.host.architecture==="amd64";
    return {schema_version:1,host_id:a.host.id,agent_id:a.agent.id,generation:Number(a.agent.current_generation),watermark:Number(r?.sequence??0),allowed:!!allowed,reason:!s.effective?"disabled":!freshCatalog(c,a.now)?"catalog_unavailable":!v.managed?"manual_installation":"allowed",expires_at:new Date(a.now.getTime()+5*60_000).toISOString(),catalog_at:c.checked_at?.toISOString()??"",default_revision:Number(s.defaults.revision),host_revision:Number(s.override?.revision??0),capabilities:[capability],candidate:candidate?{manifest:candidate.manifest,signature:candidate.signature}:null,
      reported:r?{observed_at:r.observed_at.toISOString(),version:r.observation.version,binary_sha256:r.observation.binary_sha256,runtime_sha256:r.observation.runtime_sha256,descriptor_sha256:r.observation.descriptor_sha256}:null};
  });
}
export async function platformStatus(db:Kysely<Database>,credential:string,raw:unknown,clock=()=>new Date()){
  const v=scope(raw,["sequence","observed_at","platform"]) as Record<string,unknown>&{host_id:string;agent_id:string;generation:string},sequence=counter(v.sequence);
  let platform;try{platform=observation(v.platform);}catch{fail("invalid_request",400);}
  if(typeof v.observed_at!=="string"||v.observed_at.length>35||!Number.isFinite(Date.parse(v.observed_at)))fail("invalid_request",400);
  const observed=new Date(v.observed_at);
  return db.transaction().execute(async trx=>{
    const a=await authorizeAgent(trx,credential,clock);if(a.host.id!==v.host_id||a.agent.id!==v.agent_id||a.agent.current_generation!==v.generation||observed.getTime()>a.now.getTime()+30000||observed.getTime()<a.now.getTime()-86400_000)fail("invalid_request",400);
    const old=await trx.selectFrom("agent_platform_reports").selectAll().where("agent_id","=",a.agent.id).executeTakeFirst();
    if(old&&old.generation===v.generation&&(BigInt(old.sequence)>=BigInt(sequence)||a.now.getTime()-old.received_at.getTime()<5000))return {schema_version:1,accepted:false};
    const values={generation:v.generation,sequence,observed_at:observed,received_at:a.now,observation:platform};
    await trx.insertInto("agent_platform_reports").values({agent_id:a.agent.id,...values}).onConflict(c=>c.column("agent_id").doUpdateSet(values)).execute();
    return {schema_version:1,accepted:true};
  });
}
