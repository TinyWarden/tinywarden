import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {inspectPackage} from '../../../server/skills/runtime/client';
import {admittedActionPlan} from '../../../server/maintenance/action-plan';
import type {ActionSnapshot} from '../../../lib/skills/action-types';

/** Exercise the app's default verified SDK; no database, native action or sibling checkout. */
describe('SDK3 review table admission through the app runtime',()=>{
 let root:string;
 const scalar={type:'boolean',nullable:true};
 const row={type:'object',properties:{value:scalar},required:['value'],additionalProperties:false};
 const plan=()=>({type:'object',properties:{rows:{type:'array',maxItems:3,items:structuredClone(row)}},required:['rows'],additionalProperties:false});
 beforeEach(async()=>{
  root=await mkdtemp(path.join(os.tmpdir(),'tw-action-review-'));
  await cp(path.join(process.cwd(),'tests/skills/packages/fixtures/memory-pressure'),root,{recursive:true});
  await mkdir(path.join(root,'actions'));
  const manifest=JSON.parse(await readFile(path.join(root,'skill.json'),'utf8'));
  const catalog=JSON.parse(await readFile(path.join(root,'messages/en.json'),'utf8'));
  catalog.actionLabel={text:'Action rows',parameters:{}};
  manifest.format=3;manifest.sdk=3;
  const schema={type:'object',properties:{value:scalar},required:['value'],additionalProperties:false};
  for(const name of ['input','result','recovery'])await writeFile(path.join(root,`actions/${name}.json`),JSON.stringify(schema));
  await writeFile(path.join(root,'actions/plan.json'),JSON.stringify(plan()));
  await writeFile(path.join(root,'actions/entry.py'),['prepare','fetch','apply','verify','inspect'].map(phase=>`def ${phase}(request, context):\n    raise RuntimeError('admission must not execute actions')\n`).join('\n'));
  manifest.actions=[{id:'example.review.v1',version:1,name_key:'actionLabel',description_key:'actionLabel',execution_class:'unprivileged',
   requires_approval:true,requires_monitoring:false,prepare_effect:'none',entrypoint:'actions/entry.py',prerequisites:[],
   schemas:Object.fromEntries(['input','plan','result','recovery'].map(name=>[name,`actions/${name}.json`])),
   review:{facts:[],tables:[{id:'rows',label_key:'actionLabel',source:'rows',columns:[{key:'value',label_key:'actionLabel',kind:'boolean'}]}]},result_facts:[],recovery_facts:[]}];
  await writeFile(path.join(root,'skill.json'),JSON.stringify(manifest));
  await writeFile(path.join(root,'messages/en.json'),JSON.stringify(catalog));
 });
 afterEach(async()=>{if(root)await rm(root,{recursive:true,force:true});});
 it('accepts required nonnullable tables and nullable scalar cells',async()=>{
  const admitted=await inspectPackage(root);
  expect(admitted.actions?.[0]?.descriptor.review.tables[0]?.source).toBe('rows');
  const snapshot:ActionSnapshot={...admitted.actions![0]!,catalog:admitted.catalog,
   skill_id:admitted.manifest.id,package_version:admitted.manifest.version,compatibility:admitted.manifest.compatibility};
  for(const value of [{rows:[]},{rows:[{value:false},{value:null}]}]){
   expect(admittedActionPlan(snapshot,JSON.stringify({has_changes:true,plan:value,no_changes_result:null})).plan).toEqual(value);
  }
  for(const value of [{},{rows:null},{rows:[null]}]){
   expect(()=>admittedActionPlan(snapshot,JSON.stringify({has_changes:true,plan:value,no_changes_result:null}))).toThrow();
  }
 });
 it.each(['optional','nullable_array','nullable_row'])('rejects %s bindings before Fleet can store or review them',async kind=>{
  const schema=plan();
  if(kind==='optional')schema.required=[];
  if(kind==='nullable_array')Object.assign(schema.properties.rows,{nullable:true});
  if(kind==='nullable_row')Object.assign(schema.properties.rows.items,{nullable:true});
  await writeFile(path.join(root,'actions/plan.json'),JSON.stringify(schema));
  await expect(inspectPackage(root)).rejects.toMatchObject({code:'package_rejected'});
 });
});
