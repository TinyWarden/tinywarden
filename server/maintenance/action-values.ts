import {createHash} from 'node:crypto';
import {parseActionJSON} from '../../lib/skills/action-json';
import {matchesSchema} from '../../lib/skills/schema-values';
import type {ValueSchema,PackageReason,PackageCatalog} from '../../lib/skills/package-types';
import {exactObject,uuid} from '../validation';
import {fail} from '../errors';
import {digestText} from './validation';
import type {ActionBinding} from '../../lib/skills/action-types';

export const bytesDigest=(raw:string)=>createHash('sha256').update(raw).digest('hex');
export function actionValue(schema:ValueSchema,raw:string,limit=4*1024*1024){
 try{const value=parseActionJSON(raw,limit,schema);if(!matchesSchema(schema,value))fail('maintenance_result_invalid',409);return value as Record<string,unknown>;
 }catch{fail('maintenance_result_invalid',409);}
}
export function packageReason(raw:unknown,catalog:PackageCatalog):PackageReason{
 const value=exactObject(raw,['key','params']);
 if(typeof value.key!=='string'||!Object.hasOwn(catalog,value.key))fail('maintenance_result_invalid',409);
 const entry=catalog[value.key]!,params=exactObject(value.params,Object.keys(entry.parameters));
 for(const [key,type] of Object.entries(entry.parameters)){
  const p=params[key];if(typeof p!==type||typeof p==='string'&&Array.from(p).length>512||typeof p==='number'&&!Number.isFinite(p))fail('maintenance_result_invalid',409);
 }
 return {key:value.key,params:params as PackageReason['params']};
}
export function actionBinding(raw:unknown):ActionBinding{
 const v=exactObject(raw,['installation_id','skill_id','content_sha256','action_id','action_version','descriptor_sha256','permission_revision','settings_revision','settings_sha256','input_sha256','origin']);
 const o=exactObject(v.origin,['github_id','owner_id']);
 const counter=(x:unknown)=>{if(typeof x!=='string'||!/^[1-9][0-9]{0,15}$/.test(x)||!Number.isSafeInteger(Number(x)))fail('invalid_request',400);return x;};
 if(typeof v.skill_id!=='string'||!/^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/.test(v.skill_id)||typeof v.action_id!=='string'||!/^[a-z][a-z0-9_.]{1,63}$/.test(v.action_id)||!Number.isSafeInteger(v.action_version)||Number(v.action_version)<1||Number(v.action_version)>65535)fail('invalid_request',400);
 return {installation_id:uuid(v.installation_id),skill_id:v.skill_id,action_id:v.action_id,action_version:Number(v.action_version),
  content_sha256:digestText(v.content_sha256),descriptor_sha256:digestText(v.descriptor_sha256),settings_sha256:digestText(v.settings_sha256),input_sha256:digestText(v.input_sha256),
  permission_revision:counter(v.permission_revision),settings_revision:counter(v.settings_revision),origin:{github_id:counter(o.github_id),owner_id:counter(o.owner_id)}};
}
