import {sql,type Transaction} from 'kysely';
import type {Database} from '../db/types';
import {authorize,completeAuthorization} from '../access/session';
import {hostScope,accessView,type AccessActor} from '../access/scope';
import {snapshotRead} from '../db/snapshot-read';
import {boundedText,ids,type FleetDb} from './management';
import {commandFingerprint} from '../skills/catalog/package-commands';
import {uuid} from '../validation';
import {fail} from '../errors';
export function groupOptions(search:string){const q=new URLSearchParams(search);if([...q.keys()].some(k=>!['q','cursor','selected'].includes(k))||q.getAll('q').length>1||q.getAll('cursor').length>1)fail('invalid_request',400);
 const query=boundedText(q.get('q')??'',64),selected=ids(q.getAll('selected')),scope=commandFingerprint('group_choices',query).toString('hex');let cursor:{name:string;id:string}|null=null;
 if(q.has('cursor')){const raw=q.get('cursor')!;if(raw.length>1024||! /^[A-Za-z0-9_-]+$/.test(raw))fail('invalid_request',400);try{const v=JSON.parse(Buffer.from(raw,'base64url').toString()) as Record<string,unknown>;if(v.scope!==scope||Object.keys(v).length!==3)fail('invalid_request',400);cursor={name:boundedText(v.name,64),id:uuid(v.id)};}catch{fail('invalid_request',400);}}
 return {query,selected,scope,cursor};}
type GroupRow={id:string;name:string;description:string;revision:string;count:number};
async function rows(trx:Transaction<Database>,actor:AccessActor,predicate:ReturnType<typeof sql<boolean>>,tail:ReturnType<typeof sql>){
 return (await sql<Omit<GroupRow,'count'>&{count:string}>`SELECT g.id,g.name,g.revision,${actor.role==='admin'?sql`g.description`:sql`''::text`} description,count(h.id)::text count
 FROM tinywarden.fleet_groups g LEFT JOIN tinywarden.fleet_group_hosts m ON m.group_id=g.id LEFT JOIN tinywarden.hosts h ON h.id=m.host_id AND ${hostScope(actor,'h.id')}
 WHERE ${predicate} GROUP BY g.id ${actor.role==='admin'?sql``:sql`HAVING count(h.id)>0`} ${tail}`.execute(trx)).rows.map(g=>({...g,count:Number(g.count)}));
}
export async function readGroups(db:FleetDb,cookie:string,options:ReturnType<typeof groupOptions>,clock:()=>Date){return snapshotRead(db,async trx=>{
 const actor=await authorize(trx,cookie,clock),term='%'+options.query.toLowerCase().replace(/[\\%_]/g,'\\$&')+'%';
 const predicate=sql<boolean>`lower(g.name) LIKE ${term} ${options.cursor?sql`AND (lower(g.name),g.id)>(${options.cursor.name},${options.cursor.id}::uuid)`:sql``}`;
 const groups=await rows(trx,actor,predicate,sql`ORDER BY lower(g.name),g.id LIMIT 51`),more=groups.length>50;groups.splice(50);const last=groups.at(-1);
 const selected=options.selected.length?await rows(trx,actor,sql`g.id=ANY(${options.selected}::uuid[])`,sql`ORDER BY lower(g.name),g.id`):[];
 await completeAuthorization(trx,actor,clock());return {as_of:actor.at.toISOString(),access:accessView(actor),groups,selected,next_cursor:more&&last?Buffer.from(JSON.stringify({scope:options.scope,name:last.name.toLowerCase(),id:last.id})).toString('base64url'):null};
});}
export type GroupChoices=Awaited<ReturnType<typeof readGroups>>;
