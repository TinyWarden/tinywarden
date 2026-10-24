import {sql} from 'kysely';
import type {ReviewColumn,ReviewRow} from '../../lib/maintenance/review';
import {fail} from '../errors';

type TableDefinition={id:string;label:string;source:string;columns:ReviewColumn[];row:(value:Record<string,unknown>)=>ReviewRow};
type ReviewDefinition={facts:{key:string;kind:'bytes'|'count'}[];tables:TableDefinition[]};
/** Only reviewed built-in providers define projection keys; no skill-supplied SQL/UI. */
const definitions:Readonly<Record<string,ReviewDefinition>>={
 'packages.upgrade_conservative.v1':{
  facts:[{key:'download_bytes',kind:'bytes'},{key:'unpacked_bytes',kind:'bytes'}],
  tables:[
   {id:'changes',label:'changes',source:'packages',columns:[{key:'subject',label:'package'},{key:'context',label:'architecture'},{key:'before',label:'installedVersion'},{key:'after',label:'candidateVersion'}],
    row:v=>({subject:String(v.name),context:String(v.architecture),before:String(v.installed_version),after:String(v.candidate_version)})},
   {id:'kept_back',label:'keptBack',source:'kept_back',columns:[{key:'subject',label:'package'},{key:'context',label:'architecture'},{key:'state',label:'reason'}],
    row:v=>({subject:String(v.name),context:String(v.architecture),state:v.held?'held':'kept_back'})},
  ],
 },
};
export function reviewDefinition(action:string){const value=definitions[action];if(!value)fail('maintenance_unsupported',409);return value;}
/** Project bounded summaries in PostgreSQL, not 100 possible 4MiB plans into Node. */
export function reviewSummaryProjection(){
 const cases=Object.entries(definitions).map(([action,definition])=>{
  const facts=definition.facts.map(f=>sql`jsonb_build_object('key',${f.key}::text,'kind',${f.kind}::text,'value',p.provider_plan -> ${f.key}::text)`);
  const tables=definition.tables.map(t=>sql`jsonb_build_object('id',${t.id}::text,'count',jsonb_array_length(p.provider_plan -> ${t.source}::text))`);
  return sql`WHEN j.action=${action} THEN jsonb_build_object('facts',jsonb_build_array(${sql.join(facts)}),'tables',jsonb_build_array(${sql.join(tables)}),
   'coverage',jsonb_array_length(p.verification->'members'),'not_configured',jsonb_array_length(p.verification->'not_configured'),
   'warnings',jsonb_array_length(jsonb_path_query_array(p.verification,'$.members[*] ? (@.severity == "warning")')))`;
 });
 return sql`CASE WHEN p.id IS NULL THEN NULL ${sql.join(cases,sql` `)} ELSE NULL END`;
}
