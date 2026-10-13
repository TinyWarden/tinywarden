import {requireHostAccess} from "../access/scope";
import type {Kysely,Transaction} from "kysely";
import type {Database} from "../db/types";
import type {AgentMaintenance,PlatformObservation,UpdaterStatus} from "../../lib/agent-updates";
import {authorize,completeAuthorization} from "../access/session";
import {snapshotRead} from "../db/snapshot-read";
import {fail} from "../errors";
import {uuid} from "../validation";
import {readCatalog,freshCatalog,type Catalog} from "./catalog";
import {settings} from "./policy";
import {validVersion,compare,compatible,supports,closed,digestPattern} from "./release";
type Db=Kysely<Database>|Transaction<Database>;
const outcomes=new Set(["idle","checking","disabled","available","installing","awaiting_confirmation","updated","failed","manual_required","app_required"]);
const errors=new Set(["identity_invalid","runtime_invalid","app_unreachable","release_invalid","update_failed"]);
export function observation(raw:unknown):PlatformObservation{
  const v=closed(raw,["version","managed","binary_sha256","runtime_sha256","descriptor_sha256","installed_version","local_automatic","updater"]),u=closed(v.updater,["outcome"],["checked_at","updated_at","target","error"]);
  if(!validVersion(v.version)||typeof v.managed!=="boolean"||typeof v.local_automatic!=="boolean"||typeof v.installed_version!=="string"||v.installed_version!==""&&!validVersion(v.installed_version)||![v.binary_sha256,v.runtime_sha256,v.descriptor_sha256].every(d=>typeof d==="string"&&(d===""||digestPattern.test(d)))||!outcomes.has(String(u.outcome)))throw new Error("invalid_report");
  if(u.error!==undefined&&!errors.has(String(u.error))||u.target!==undefined&&!validVersion(u.target))throw new Error("invalid_report");
  for(const key of ["checked_at","updated_at"])if(u[key]!==undefined&&(typeof u[key]!=="string"||u[key].length>35||!Number.isFinite(Date.parse(u[key]))))throw new Error("invalid_report");
  return {...v,updater:u as unknown as UpdaterStatus} as unknown as PlatformObservation;
}
interface Evidence {version:string;generation:string;observation:PlatformObservation|null;observed:Date|null;staleAfter:number}
export function projectMaintenance(e:Evidence,c:Catalog,p:{automatic:boolean;override:boolean|null;revision:string;default_revision:string},now:Date):AgentMaintenance{
  const o=e.observation,source=o?.version??e.version,newest=c.releases[0]?.metadata.version??null;
  const target=c.releases.find(r=>supports(r.metadata)&&compatible(r.metadata,source));
  const result:AgentMaintenance={state:"unavailable",running_version:source,available_version:target?.metadata.version??null,newest_version:newest,observed_at:e.observed?.toISOString()??null,catalog_at:c.checked_at?.toISOString()??null,checked_at:o?.updater.checked_at??null,updated_at:o?.updater.updated_at??null,local_automatic:o?.local_automatic??null,...p};
  if(!o){result.state="manual";return result;}
  if(o.updater.outcome==="failed"){result.state="failed";return result;}
  if(!o.managed){result.state="manual";return result;}
  const known=c.releases.find(r=>r.metadata.version===source)?.metadata;
  if(known&&(o.binary_sha256!==known.binary_sha256||o.runtime_sha256!==known.runtime_sha256||o.descriptor_sha256!==known.descriptor_sha256)){result.state="unrecognized";return result;}
  if(!e.observed||e.observed>now||now.getTime()-e.observed.getTime()>e.staleAfter*1000){return result;}
  if(o.updater.outcome==="installing"){result.state="updating";return result;}
  if(o.installed_version&&o.installed_version!==source||o.updater.outcome==="awaiting_confirmation"){result.state="confirming";return result;}
  if(!freshCatalog(c,now)||!newest)return result;
  if(target&&compare(target.metadata.version,source)>0){result.state="available";return result;}
  if(validVersion(source)&&compare(newest,source)>0){result.state=supports(c.releases[0]!.metadata)?"manual_required":"app_required";return result;}
  result.state=known?"current":"unrecognized";return result;
}
export async function maintenanceForHosts(db:Db,ids:string[],now:Date,catalog?:Catalog):Promise<Map<string,AgentMaintenance>>{
  const result=new Map<string,AgentMaintenance>();if(!ids.length)return result;
  const [c,defaults,policies,rows]=await Promise.all([catalog?Promise.resolve(catalog):readCatalog(db),settings(db),db.selectFrom("host_agent_update_policies").selectAll().where("host_id","in",ids).execute(),db.selectFrom("hosts as h").leftJoin("agents as a","a.host_id","h.id").leftJoin("agent_credentials as cr",j=>j.onRef("cr.agent_id","=","a.id").onRef("cr.generation","=","a.current_generation").on("cr.revoked_at","is",null)).leftJoin("agent_platform_reports as r",j=>j.onRef("r.agent_id","=","a.id").onRef("r.generation","=","a.current_generation"))
    .select(["h.id","h.enrolled_agent_version","cr.agent_version","a.current_generation","a.stale_after_seconds","r.observation","r.observed_at"]).where("h.id","in",ids).execute()]);
  const byHost=new Map(policies.map(p=>[p.host_id,p]));
  for(const r of rows){const p=byHost.get(r.id);result.set(r.id,projectMaintenance({version:r.agent_version??r.enrolled_agent_version,generation:r.current_generation??"0",observation:r.observation,observed:r.observed_at,staleAfter:r.stale_after_seconds??180},c,{automatic:p?.automatic??defaults.defaults.automatic,override:p?.automatic??null,revision:p?.revision??"0",default_revision:defaults.defaults.revision},now));}
  return result;
}
export async function readHostMaintenance(db:Kysely<Database>,cookie:string,id:string,clock=()=>new Date()){
  uuid(id);return snapshotRead(db,async trx=>{const actor=await authorize(trx,cookie,clock);await requireHostAccess(trx,actor,id);const result=(await maintenanceForHosts(trx,[id],actor.at)).get(id);if(!result)fail("not_found",404);await completeAuthorization(trx,actor,clock());return result;});
}
