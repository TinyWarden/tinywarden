import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/types';
import { authorize, completeAuthorization } from '../access/session';
import { hostScope, accessView } from '../access/scope';
import { snapshotRead } from '../db/snapshot-read';
import { fleetEvidence } from '../skills/results/fleet-evidence';
import { projectFleetHost } from './dashboard-model';
import { fail } from '../errors';
import { commandFingerprint } from '../skills/catalog/package-commands';
import { uuid } from '../validation';
import { boundedText, type FleetDb } from './management';
import {updateAvailability} from '../agent-updates/requests';
import type {UpdateAvailability} from '../../lib/agent-updates';

export function fleetOptions(search:string){
  const q=new URLSearchParams(search),keys=['q','group','tag','lifecycle','health','contact','maintenance','os','version','sort','limit','cursor'];
  if([...q.keys()].some(k=>!keys.includes(k))||keys.filter(k=>!['group','tag','health','contact'].includes(k)).some(k=>q.getAll(k).length>1))fail('invalid_request',400);
  const lifecycle=q.get('lifecycle')??'active',sort=q.get('sort')??'name',limit=Number(q.get('limit')??25),maintenance=q.get('maintenance')??'all';
  if(!['all','active','paused','archived'].includes(lifecycle)||!['name','status','contact'].includes(sort)||!Number.isInteger(limit)||limit<1||limit>100||!['all','active','scheduled','none'].includes(maintenance))fail('invalid_request',400);
  const groups=q.getAll('group');if(groups.length>100)fail('invalid_request',400);for(const id of groups)if(id!=='ungrouped')uuid(id);
  const tags=q.getAll('tag').map(v=>boundedText(v,64,false).toLowerCase());if(tags.length>20)fail('invalid_request',400);
  const health=q.getAll('health'),contact=q.getAll('contact');
  if(health.some(v=>!['critical','warning','unknown','healthy'].includes(v))||contact.some(v=>!['current','stale','unknown','revoked'].includes(v)))fail('invalid_request',400);
  const options={query:boundedText(q.get('q')??'',100),groups,tags,lifecycle,health,contact,maintenance,os:boundedText(q.get('os')??'',100),version:boundedText(q.get('version')??'',64),sort,limit};
  const scope=commandFingerprint('fleet_list',options).toString('hex');let cursor:{key:string;id:string;scope:string}|null=null;
  if(q.has('cursor')){const raw=q.get('cursor')!;if(raw.length>1024||! /^[A-Za-z0-9_-]+$/.test(raw))fail('invalid_request',400);
    try{const decoded=JSON.parse(Buffer.from(raw,'base64url').toString('utf8')) as Record<string,unknown>;
      if(typeof decoded.key!=='string'||decoded.key.length>400||decoded.scope!==scope||Object.keys(decoded).length!==3)fail('invalid_request',400);
      cursor={key:decoded.key,id:uuid(decoded.id),scope};
    }catch{fail('invalid_request',400);}}
  return {...options,scope,cursor};
}
export async function maintenanceState(trx:Transaction<Database>,hostIds:string[],at:Date){
  if(!hostIds.length)return [];
  return (await trx.selectFrom('fleet_maintenance').selectAll().where('host_id','in',hostIds).where('closed_at','is',null)
    .where(eb=>eb.or([eb('ends_at','is',null),eb('ends_at','>',at)])).execute()).map(w=>({id:w.id,host_id:w.host_id,revision:w.revision,starts_at:w.starts_at.toISOString(),ends_at:w.ends_at?.toISOString()??null,phase:w.starts_at<=at?'active' as const:'scheduled' as const}));
}
export async function readFleet(db:FleetDb,cookie:string,options:ReturnType<typeof fleetOptions>,clock:()=>Date,elapsed=()=>performance.now()){
 return snapshotRead(db,async trx=>{
  await sql`SET LOCAL transaction_timeout='15s'`.execute(trx);
  const started=elapsed(),actor=await authorize(trx,cookie,clock),at=actor.at;
  const visible=hostScope(actor,'h.id');
  const groupRows=(await sql<{id:string;name:string;description:string;revision:string;count:string}>`SELECT g.id,g.name,${actor.role==='admin'?sql`g.description`:sql`''::text`} description,g.revision,count(h.id)::text count
    FROM tinywarden.fleet_groups g LEFT JOIN tinywarden.fleet_group_hosts m ON m.group_id=g.id
    LEFT JOIN tinywarden.hosts h ON h.id=m.host_id AND ${visible}
    GROUP BY g.id ${actor.role==='admin'?sql``:sql`HAVING count(h.id)>0`} ORDER BY lower(g.name),g.id LIMIT 1000`.execute(trx)).rows.map(g=>({...g,count:Number(g.count)}));
  const totals=await sql<{all_count:string;ungrouped:string}>`SELECT count(*)::text all_count,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM tinywarden.fleet_group_hosts m WHERE m.host_id=h.id))::text ungrouped FROM tinywarden.hosts h WHERE ${visible}`.execute(trx);
  const escape=(text:string)=>text.replace(/[\\%_]/g,'\\$&');
  const predicate=sql<boolean>`${visible}
    AND (${options.query===''?sql`TRUE`:sql`lower(h.label) LIKE ${'%'+escape(options.query.toLowerCase())+'%'} OR lower(h.reported_hostname) LIKE ${'%'+escape(options.query.toLowerCase())+'%'} OR EXISTS(SELECT 1 FROM tinywarden.fleet_host_tags t WHERE t.host_id=h.id AND t.tag LIKE ${'%'+escape(options.query.toLowerCase())+'%'})`})
    AND (${!options.groups.length?sql`TRUE`:sql`EXISTS(SELECT 1 FROM tinywarden.fleet_group_hosts m WHERE m.host_id=h.id AND m.group_id=ANY(${options.groups.filter(g=>g!=='ungrouped')}::uuid[])) ${options.groups.includes('ungrouped')?sql`OR NOT EXISTS(SELECT 1 FROM tinywarden.fleet_group_hosts m WHERE m.host_id=h.id)`:sql``}`})
    AND (${!options.tags.length?sql`TRUE`:sql`EXISTS(SELECT 1 FROM tinywarden.fleet_host_tags t WHERE t.host_id=h.id AND t.tag=ANY(${options.tags}::text[]))`})
    AND (${!options.os?sql`TRUE`:sql`h.os_id||' '||h.os_version=${options.os}`})
    AND (${!options.version?sql`TRUE`:sql`COALESCE((SELECT c.agent_version FROM tinywarden.agents a JOIN tinywarden.agent_credentials c ON c.agent_id=a.id AND c.generation=a.current_generation WHERE a.host_id=h.id),h.enrolled_agent_version)=${options.version}`})`;
  const counts={all:0,active:0,paused:0,archived:0},updates=new Map<string,UpdateAvailability>();
  const page:ReturnType<typeof shape>[]=[];let matching=0,after='00000000-0000-0000-0000-000000000000';
  const compare=(a:{sort_key:string;host_id:string},b:{sort_key:string;host_id:string})=>a.sort_key<b.sort_key?-1:a.sort_key>b.sort_key?1:a.host_id.localeCompare(b.host_id);
  function shape(e:Awaited<ReturnType<typeof fleetEvidence>>[number],groups:{group_id:string}[],labels:{tag:string}[],control:{generation:string;applied_epoch:string|null}|undefined,maintenance:Awaited<ReturnType<typeof maintenanceState>>[number]|undefined){
    const v=projectFleetHost(e),h=e.host,health=['critical','warning','unknown','healthy'][v.priority]!;
    const sort_key=options.sort==='status'?String(v.priority)+':'+h.label.toLowerCase():options.sort==='contact'?String(9999999999999-(v.last_contact_at?Date.parse(v.last_contact_at):0)).padStart(13,'0'):h.label.toLowerCase();
    return {host_id:h.id,agent_id:v.agent_id,label:h.label,reported_hostname:h.reported_hostname,os_id:h.os_id,os_version:h.os_version,architecture:h.architecture,agent_version:v.agent_version,
      description:h.description,owner_notes:actor.role==='admin'?h.owner_notes:undefined,lifecycle:h.lifecycle,revision:h.fleet_revision,monitoring_epoch:h.monitoring_epoch,
      control_supported:!!control&&control.generation===e.agent?.current_generation,control_applied:control?.generation===e.agent?.current_generation&&control?.applied_epoch===h.monitoring_epoch,
      contact_state:v.contact_state,last_contact_at:v.last_contact_at,health_state:health,groups:groups.map(g=>g.group_id),tags:labels.map(t=>t.tag),maintenance:maintenance??null,...(actor.role==='admin'?{update:updates.get(h.id)}:{}),sort_key};
  }
  while(true){
    if(elapsed()-started>10000)fail('temporarily_unavailable',503);
    const hosts=await trx.selectFrom('hosts as h').selectAll('h').where(predicate).where('h.id','>',after).orderBy('h.id').limit(50).execute();
    if(!hosts.length)break;const hostIds=hosts.map(h=>h.id);
    if(actor.role==='admin')for(const [id,value] of await updateAvailability(trx,hosts,at))updates.set(id,value);
    const groups=await trx.selectFrom('fleet_group_hosts').selectAll().where('host_id','in',hostIds).execute();
    const labels=await trx.selectFrom('fleet_host_tags').selectAll().where('host_id','in',hostIds).execute();
    const controls=await trx.selectFrom('fleet_agent_control as c').innerJoin('agents as a','a.id','c.agent_id').selectAll('c').select('a.host_id').where('a.host_id','in',hostIds).execute();
    const windows=await maintenanceState(trx,hostIds,at);
    for(const e of await fleetEvidence(trx,hosts,at)){
      const h=e.host,row=shape(e,groups.filter(g=>g.host_id===h.id),labels.filter(t=>t.host_id===h.id),controls.find(c=>c.host_id===h.id),windows.find(w=>w.host_id===h.id));
      if(options.health.length&&!options.health.includes(row.health_state)||options.contact.length&&!options.contact.includes(row.contact_state)||options.maintenance!=='all'&&(options.maintenance==='none'?!!row.maintenance:row.maintenance?.phase!==options.maintenance))continue;
      counts.all++;if(row.lifecycle!=='deleting')counts[row.lifecycle]++;
      if(options.lifecycle!=='all'&&row.lifecycle!==options.lifecycle)continue;matching++;
      if(options.cursor&&compare(row,{sort_key:options.cursor.key,host_id:options.cursor.id})<=0)continue;
      page.push(row);page.sort(compare);if(page.length>options.limit+1)page.pop();
    }
    after=hosts.at(-1)!.id;if(hosts.length<50)break;
  }
  const hasMore=page.length>options.limit;page.splice(options.limit);const last=page.at(-1);
  const tagChoices=(await sql<{tag:string}>`SELECT DISTINCT t.tag FROM tinywarden.fleet_host_tags t JOIN tinywarden.hosts h ON h.id=t.host_id WHERE ${visible} ORDER BY tag LIMIT 1000`.execute(trx)).rows.map(t=>t.tag);
  await completeAuthorization(trx,actor,clock());
  return {access:accessView(actor),as_of:at.toISOString(),hosts:page.map(({sort_key,...row})=>{void sort_key;return row;}),counts,total:matching,
    groups:groupRows,group_totals:{all:Number(totals.rows[0]!.all_count),ungrouped:Number(totals.rows[0]!.ungrouped)},tag_choices:tagChoices,
    next_cursor:hasMore&&last?Buffer.from(JSON.stringify({scope:options.scope,key:last.sort_key,id:last.host_id})).toString('base64url'):null};
 });
}
export type FleetView=Awaited<ReturnType<typeof readFleet>>;
