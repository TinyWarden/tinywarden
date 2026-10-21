import {sql,type Transaction} from 'kysely';
import type {Database} from '../db/types';
import {authorize,completeAuthorization} from '../access/session';
import {requireAdmin,accessView} from '../access/scope';
import {snapshotRead} from '../db/snapshot-read';
import {commandFingerprint} from '../skills/catalog/package-commands';
import {uuid} from '../validation';
import {fail} from '../errors';
import type {FleetDb} from './management';
export function activityOptions(search:string,kind:'setups'|'operations'){
 const q=new URLSearchParams(search);if([...q.keys()].some(k=>!['pending','cursor'].includes(k))||[...q.keys()].some(k=>q.getAll(k).length!==1)||q.has('pending')&&!['0','1'].includes(q.get('pending')!))fail('invalid_request',400);
 const pending=q.get('pending')==='1',scope=commandFingerprint('fleet_activity',kind,pending).toString('hex');let cursor:{at:Date;id:string}|null=null;
 if(q.has('cursor')){const raw=q.get('cursor')!;if(raw.length>1024||! /^[A-Za-z0-9_-]+$/.test(raw))fail('invalid_request',400);try{const v=JSON.parse(Buffer.from(raw,'base64url').toString()) as Record<string,unknown>;if(v.scope!==scope||Object.keys(v).length!==3||typeof v.at!=='string'||!Number.isFinite(Date.parse(v.at))||new Date(v.at).toISOString()!==v.at)fail('invalid_request',400);cursor={at:new Date(v.at),id:uuid(v.id)};}catch{fail('invalid_request',400);}}
 return {pending,scope,cursor};
}
async function page<T extends {id:string}>(trx:Transaction<Database>,table:string,stamp:string,fields:ReturnType<typeof sql>,predicate:ReturnType<typeof sql<boolean>>,options:ReturnType<typeof activityOptions>){
 const total=(await sql<{total:string}>`SELECT count(*)::text total FROM ${sql.id('tinywarden',table)} x WHERE ${predicate}`.execute(trx)).rows[0]!.total;
 const rows=(await sql<T&{stamp:Date}>`SELECT x.id,${sql.ref('x.'+stamp)} stamp,${fields} FROM ${sql.id('tinywarden',table)} x WHERE ${predicate} ${options.cursor?sql`AND (${sql.ref('x.'+stamp)},x.id)<(${options.cursor.at},${options.cursor.id}::uuid)`:sql``} ORDER BY ${sql.ref('x.'+stamp)} DESC,x.id DESC LIMIT 26`.execute(trx)).rows;
 const more=rows.length>25;rows.splice(25);const last=rows.at(-1);
 return {total:Number(total),items:rows.map(({stamp,...row})=>{void stamp;return row;}),next_cursor:more&&last?Buffer.from(JSON.stringify({scope:options.scope,at:last.stamp.toISOString(),id:last.id})).toString('base64url'):null};
}
export async function setupActivity(db:FleetDb,cookie:string,options:ReturnType<typeof activityOptions>,clock:()=>Date){return snapshotRead(db,async trx=>{
 const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
 const result=await page<{id:string;label:string;target_agent_id:string|null;issued_at:Date;expires_at:Date;revoked_at:Date|null;consumed_at:Date|null;fleet_intent:Record<string,unknown>}>(trx,'enrollment_tokens','issued_at',sql`x.label,x.target_agent_id,x.issued_at,x.expires_at,x.revoked_at,x.consumed_at,x.fleet_intent`,sql`x.issued_at<=${actor.at} ${options.pending?sql`AND x.consumed_at IS NULL AND x.revoked_at IS NULL AND x.expires_at>${actor.at}`:sql``}`,options);
 await completeAuthorization(trx,actor,clock());return {as_of:actor.at.toISOString(),access:accessView(actor),total:result.total,next_cursor:result.next_cursor,setups:result.items.map(r=>({id:r.id,label:r.label,issued_at:r.issued_at.toISOString(),expires_at:r.expires_at.toISOString(),mode:String(r.fleet_intent.purpose??(r.target_agent_id?'replace':'new')),state:r.consumed_at?'consumed':r.revoked_at?'cancelled':r.expires_at<=actor.at?'expired':'pending'}))};
});}
export async function operationActivity(db:FleetDb,cookie:string,options:ReturnType<typeof activityOptions>,clock:()=>Date){return snapshotRead(db,async trx=>{
 const actor=await authorize(trx,cookie,clock);requireAdmin(actor);
 const result=await page<{id:string;kind:string;created_at:Date}>(trx,'fleet_operations','created_at',sql`x.kind,x.created_at`,sql`x.kind=ANY(${['pause','resume','archive','delete','membership','maintenance','metadata']}::text[]) AND x.created_at<=${actor.at} ${options.pending?sql`AND (EXISTS(SELECT 1 FROM tinywarden.fleet_operation_items i WHERE i.operation_id=x.id AND i.state='pending') OR EXISTS(SELECT 1 FROM tinywarden.fleet_purge_jobs p WHERE p.operation_id=x.id AND p.state<>'completed'))`:sql``}`,options);
 await completeAuthorization(trx,actor,clock());return {as_of:actor.at.toISOString(),access:accessView(actor),total:result.total,next_cursor:result.next_cursor,operations:result.items};
});}
