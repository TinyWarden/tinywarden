import {createHash} from 'node:crypto';
import {exactObject,uuid} from '../validation';
import {fail} from '../errors';
import {maintenanceLimits} from '../../lib/maintenance/policy';

/** Matches the adapter's ASCII canonical JSON without relying on object insertion order. */
export function canonicalMaintenance(value:unknown):string{
 if(value===null||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='string'){
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 }
 if(typeof value==='number'){
  if(!Number.isSafeInteger(value))fail('invalid_request',400);return JSON.stringify(value);
 }
 if(Array.isArray(value))return '['+value.map(canonicalMaintenance).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonicalMaintenance(v)).join(',')+'}';
 fail('invalid_request',400);
}
export function maintenanceDigest(value:unknown){return createHash('sha256').update(canonicalMaintenance(value)).digest('hex');}
export function digestText(value:unknown){if(typeof value!=='string'||!/^([a-f0-9]{64})$/.test(value))fail('invalid_request',400);return value;}
export function maintenanceInput(raw:unknown){
 const v=exactObject(raw,['request_id','grant_id','content_sha256','descriptor_sha256','permission_revision','input_json','targets']);
 if(typeof v.input_json!=='string'||Buffer.byteLength(v.input_json)>65536||typeof v.permission_revision!=='string'||!/^[1-9][0-9]{0,15}$/.test(v.permission_revision)||!Number.isSafeInteger(Number(v.permission_revision))||!Array.isArray(v.targets)||v.targets.length<1||v.targets.length>maintenanceLimits.targets)fail('invalid_request',400);
 const targets=v.targets.map(raw=>{
  const t=exactObject(raw,['id','revision']);if(typeof t.revision!=='string'||!/^[1-9][0-9]{0,15}$/.test(t.revision)||!Number.isSafeInteger(Number(t.revision)))fail('invalid_request',400);
  return {id:uuid(t.id),revision:t.revision};
 });
 if(new Set(targets.map(t=>t.id)).size!==targets.length)fail('invalid_request',400);
 return {request_id:uuid(v.request_id),grant_id:uuid(v.grant_id),content_sha256:digestText(v.content_sha256),descriptor_sha256:digestText(v.descriptor_sha256),permission_revision:v.permission_revision,input_json:v.input_json,targets};
}
