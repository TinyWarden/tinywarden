import type {Kysely,Transaction} from 'kysely';
import type {Database} from '../db/types';
import type {ReviewRow} from '../../lib/maintenance/review';
import type {VerificationSnapshot} from '../../lib/maintenance/contracts';
import {packageText} from '../../lib/skills/package-types';
import {managementRoot,managementFinish} from '../fleet/management';
import {uuid} from '../validation';
import {fail} from '../errors';
import {providerPlan} from './legacy/providers';
import {reviewDefinition} from './legacy/review';
import type {ActionSnapshot} from '../../lib/skills/action-types';
import type {ReviewColumn} from '../../lib/maintenance/review';

/** Baseline warnings retain their named resource scope; healthy resources are counted. */
async function coverageRows(trx:Transaction<Database>,snapshot:VerificationSnapshot):Promise<ReviewRow[]>{
 const ids=[...snapshot.members.map(m=>m.installation_id),...snapshot.not_configured];
 const installations=ids.length?await trx.selectFrom('skill_installations').select(['id','content_sha256']).where('id','in',ids).execute():[];
 const hashes=[...new Set([...snapshot.members.map(m=>m.package_sha256),...installations.map(i=>i.content_sha256)])];
 const packages=hashes.length?await trx.selectFrom('skill_packages').select(['content_sha256','metadata']).where('content_sha256','in',hashes).execute():[];
 const name=(id:string,hash?:string)=>{const content=hash??installations.find(i=>i.id===id)?.content_sha256,p=packages.find(p=>p.content_sha256===content);
  return p?packageText(p.metadata.catalog,{key:p.metadata.manifest.name_key,params:{}}):id;};
 return [...snapshot.members.flatMap(m=>[
  {subject:name(m.installation_id,m.package_sha256),context:String(m.subjects.length),state:m.severity},
  ...m.subjects.filter(s=>s.status==='warning').map(s=>({subject:name(m.installation_id,m.package_sha256),context:s.collection+'/'+s.key,state:s.status})),
 ]),...snapshot.not_configured.map(id=>({subject:name(id),context:'',state:'not_configured'}))];
}

export async function readMaintenancePlan(db:Kysely<Database>,cookie:string,operation:string,id:string,search:string,clock:()=>Date){
 operation=uuid(operation);id=uuid(id);const q=new URLSearchParams(search);
 if([...q.keys()].some(k=>!['table','page'].includes(k)||q.getAll(k).length!==1))fail('invalid_request',400);
 const table=q.get('table'),page=Number(q.get('page')??'1'),pageSize=25;
 if(!Number.isSafeInteger(page)||page<1||page>100000)fail('invalid_request',400);
 return db.transaction().execute(async trx=>{
  const actor=await managementRoot(trx,cookie,clock,false);
  const plan=await trx.selectFrom('maintenance_plans as p').innerJoin('maintenance_jobs as j','j.id','p.job_id')
   .innerJoin('fleet_operations as o','o.id','j.operation_id').innerJoin('hosts as h','h.id','j.host_id')
   .selectAll('p').select(['j.action','j.phase','j.attention','j.host_id','h.label','j.revision','j.action_snapshot'])
   .where('o.id','=',operation).where('o.kind','=','maintenance_action').where('p.id','=',id).whereRef('j.plan_id','=','p.id').executeTakeFirst();
  if(!plan)fail('not_found',404);
  const snapshot:ActionSnapshot|null=plan.action_snapshot;
  const definition=snapshot?{
   facts:snapshot.descriptor.review.facts.map(f=>({...f,label:packageText(snapshot.catalog,{key:f.label_key,params:{}})})),
   tables:snapshot.descriptor.review.tables.map(t=>({...t,label:packageText(snapshot.catalog,{key:t.label_key,params:{}}),
    columns:t.columns.map(c=>({...c,label:packageText(snapshot.catalog,{key:c.label_key,params:{}})})),row:(v:Record<string,unknown>)=>Object.fromEntries(t.columns.map(c=>[c.key,v[c.key]??null]))})),
  }:reviewDefinition(plan.action);
  const provider=snapshot?plan.provider_plan:providerPlan(plan.action,plan.provider_plan).plan;
  const coverage=await coverageRows(trx,plan.verification);
  const tables=[...definition.tables.map(t=>({id:t.id,label:t.label,columns:t.columns,count:(provider[t.source] as unknown[]).length})),
   {id:'coverage',label:'coverage',columns:[{key:'subject' as const,label:'check'},{key:'context' as const,label:'resources'},{key:'state' as const,label:'baseline'}],count:coverage.length}];
  const selected=tables.find(t=>t.id===(table??tables[0]?.id));if(!selected||page>Math.max(1,Math.ceil(selected.count/pageSize)))fail('invalid_request',400);
  const adapter=definition.tables.find(t=>t.id===selected.id);
  const rows=selected.id==='coverage'?coverage:(provider[adapter!.source] as Record<string,unknown>[]).map(adapter!.row);
  return {as_of:actor.at.toISOString(),access:await managementFinish(trx,actor,clock),id:plan.id,job_id:plan.job_id,operation_id:operation,
   digest:plan.digest,action:plan.action,created_at:plan.created_at.toISOString(),expires_at:plan.expires_at.toISOString(),host_id:plan.host_id,label:plan.label,
   phase:plan.phase,attention:plan.attention,revision:plan.revision,
   ...(snapshot?{name:packageText(snapshot.catalog,{key:snapshot.descriptor.name_key,params:{}}),description:packageText(snapshot.catalog,{key:snapshot.descriptor.description_key,params:{}}),package_defined:true}:{}),
   facts:definition.facts.map(f=>({...f,value:provider[f.key]??null})),tables:tables as {id:string;label:string;columns:ReviewColumn[];count:number}[],table:selected.id,page,page_size:pageSize,total:selected.count,
   rows:rows.slice((page-1)*pageSize,page*pageSize),coverage:{configured:plan.verification.members.length,warnings:plan.verification.members.filter(m=>m.severity==='warning').length,not_configured:plan.verification.not_configured.length}};
 });
}
