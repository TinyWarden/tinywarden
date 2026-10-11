import type {Kysely,Transaction} from "kysely";
import type {Database} from "../db/types";
import {authorize,completeAuthorization} from "../access/session";
import {snapshotRead} from "../db/snapshot-read";
import {fail} from "../errors";
import {uuid,sameDigest} from "../validation";
import {commandFingerprint,nextCounter} from "../skills/catalog/package-commands";
import {packageText,isPackageSkillId} from "../../lib/skills/package-types";
import {columnKey,compareSkillNames,defaultDashboardLayout,type DashboardLayout,type DashboardColumnRef,type DashboardColumn,type DashboardCatalog} from "../../lib/skills/dashboard-types";
import messages from "../../messages/en.json";
type Db=Kysely<Database>|Transaction<Database>;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
function closed(v:unknown,keys:string[]):Record<string,unknown>{if(!object(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail("invalid_request",400);return v;}
export function parseLayout(raw:unknown):DashboardLayout {
  const v=closed(raw,["format","sections"]);if(v.format!==1||!Array.isArray(v.sections)||v.sections.length!==2)fail("invalid_request",400);
  const table=closed(v.sections[0],["id","type","columns"]),changes=closed(v.sections[1],["id","type","visible"]);
  if(table.id!=="servers"||table.type!=="server_table"||!Array.isArray(table.columns)||table.columns.length>32||changes.id!=="changes"||changes.type!=="change_feed"||typeof changes.visible!=="boolean")fail("invalid_request",400);
  const columns=table.columns.map((raw):DashboardColumnRef=>{
    if(!object(raw))fail("invalid_request",400);
    if(raw.kind==="server"){const r=closed(raw,["kind","field"]);if(r.field!=="os"&&r.field!=="agent_version")fail("invalid_request",400);return {kind:"server",field:r.field};}
    const r=closed(raw,["kind","skill_id","field_id"]);
    if(r.kind!=="skill"||!isPackageSkillId(r.skill_id)||typeof r.field_id!=="string"||!/^[a-z][a-z0-9_]{0,63}$/.test(r.field_id))fail("invalid_request",400);
    return {kind:"skill",skill_id:r.skill_id,field_id:r.field_id};
  }).sort((a,b)=>columnKey(a).localeCompare(columnKey(b)));
  if(new Set(columns.map(columnKey)).size!==columns.length)fail("invalid_request",400);
  return {format:1,sections:[{id:"servers",type:"server_table",columns},{id:"changes",type:"change_feed",visible:changes.visible}]};
}
export async function dashboardCatalog(db:Db,selected?:DashboardColumnRef[]):Promise<DashboardCatalog>{
  let query=db.selectFrom("skill_installations as i").innerJoin("skill_packages as p","p.content_sha256","i.content_sha256")
    .select(["p.metadata","i.enabled"]).orderBy("i.id").limit(101);
  if(selected){const ids=selected.flatMap(r=>r.kind==="skill"?[r.skill_id]:[]);query=query.where("i.skill_id","in",ids.length?ids:[""]);}
  const packages=await query.execute();
  if(packages.length>100)fail("temporarily_unavailable",503);
  const skills=packages.map(({metadata:m,enabled})=>{
    const name=packageText(m.catalog,{key:m.manifest.name_key,params:{}});
    return {id:m.manifest.id,name,enabled,fields:(m.display?.dashboard?.fields??[]).map(f=>({ref:{kind:"skill" as const,skill_id:m.manifest.id,field_id:f.id},label:packageText(m.catalog,{key:f.label_key,params:{}}),skill_name:name,available:true}))
      .sort((a,b)=>compareSkillNames(a.label,b.label)||columnKey(a.ref).localeCompare(columnKey(b.ref)))};
  }).sort((a,b)=>compareSkillNames(a.name,b.name)||a.id.localeCompare(b.id));
  const server:DashboardColumn[]=[{ref:{kind:"server",field:"agent_version"},label:messages.fleet.agentVersion,skill_name:null,available:true},{ref:{kind:"server",field:"os"},label:messages.fleet.operatingSystem,skill_name:null,available:true}];
  const result={server,skills};if(Buffer.byteLength(JSON.stringify(result))>1024*1024)fail("temporarily_unavailable",503);return result;
}
export function resolveColumns(layout:DashboardLayout,catalog:DashboardCatalog):DashboardColumn[]{
  const available=[...catalog.server,...catalog.skills.flatMap(s=>s.fields)],byKey=new Map(available.map(c=>[columnKey(c.ref),c]));
  return layout.sections[0].columns.map(ref=>byKey.get(columnKey(ref))??{ref,label:ref.kind==="skill"?ref.field_id:ref.field,skill_name:ref.kind==="skill"?ref.skill_id:null,available:false})
    .sort((a,b)=>Number(a.ref.kind==="skill")-Number(b.ref.kind==="skill")||compareSkillNames(a.skill_name??"",b.skill_name??"")||compareSkillNames(a.label,b.label)||columnKey(a.ref).localeCompare(columnKey(b.ref)));
}
export async function storedLayout(db:Db,operator:string){const row=await db.selectFrom("operator_dashboard_layouts").selectAll().where("operator_id","=",operator).executeTakeFirst();return {row,revision:row?.revision??"0",layout:row?parseLayout(row.layout):defaultDashboardLayout()};}
export async function readDashboardLayout(db:Kysely<Database>,cookie:string,clock=()=>new Date()){
  return snapshotRead(db,async trx=>{const actor=await authorize(trx,cookie,clock),saved=await storedLayout(trx,actor.operatorId),catalog=await dashboardCatalog(trx);
    await completeAuthorization(trx,actor,clock());return {as_of:actor.at.toISOString(),revision:saved.revision,layout:saved.layout,catalog,columns:resolveColumns(saved.layout,catalog)};});
}
export async function saveDashboardLayout(db:Kysely<Database>,cookie:string,input:{request_id:unknown;expected_revision:unknown;layout:unknown},clock=()=>new Date()){
  const request=uuid(input.request_id),expected=input.expected_revision,layout=parseLayout(input.layout);
  if(typeof expected!=="string"||!/^(0|[1-9][0-9]{0,15})$/.test(expected)||!Number.isSafeInteger(Number(expected)))fail("invalid_request",400);
  const digest=commandFingerprint("dashboard-layout",expected,layout);
  return db.transaction().execute(async trx=>{
    const actor=await authorize(trx,cookie,clock),saved=await storedLayout(trx,actor.operatorId);
    if(saved.row?.last_request_id===request){if(!sameDigest(saved.row.last_fingerprint,digest))fail("idempotency_conflict",409);await completeAuthorization(trx,actor,clock());return {revision:saved.revision};}
    if(saved.revision!==expected)fail("settings_conflict",409);
    const catalog=await dashboardCatalog(trx),available=new Set([...catalog.server,...catalog.skills.flatMap(s=>s.fields)].map(c=>columnKey(c.ref))),old=new Set(saved.layout.sections[0].columns.map(columnKey));
    if(layout.sections[0].columns.some(ref=>!available.has(columnKey(ref))&&!old.has(columnKey(ref))))fail("settings_conflict",409);
    const revision=nextCounter(saved.revision),values={layout,revision,updated_at:actor.at,last_request_id:request,last_fingerprint:digest};
    await trx.insertInto("operator_dashboard_layouts").values({operator_id:actor.operatorId,...values}).onConflict(c=>c.column("operator_id").doUpdateSet(values)).execute();
    await completeAuthorization(trx,actor,clock());return {revision};
  });
}
