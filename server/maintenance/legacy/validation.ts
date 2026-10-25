import {exactObject} from "../../validation";
import {fail} from "../../errors";
import {maintenanceLimits} from "../../../lib/maintenance/policy";
import type {UpgradePlan,PackageChange} from "../../../lib/maintenance/legacy-contracts";
import {canonicalMaintenance,digestText} from "../validation";

function boundedAscii(value:unknown,pattern:RegExp,max:number){
 if(typeof value!=='string'||!value.length||value.length>max||!pattern.test(value))fail('invalid_request',400);return value;
}
function size(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0)fail('invalid_request',400);return value as number;}
function identity(raw:unknown){
 const v=exactObject(raw,['name','architecture']);
 return {name:boundedAscii(v.name,/^[a-z0-9][a-z0-9+.-]*$/,256),architecture:boundedAscii(v.architecture,/^[a-z0-9][a-z0-9-]*$/,32)};
}
export function validateUpgradePlan(raw:unknown):UpgradePlan{
 const v=exactObject(raw,['schema_version','action','provider_version','policy_sha256','state_sha256','sources_sha256','indexes_sha256','config_sha256','selection_sha256','local_sha256','packages','kept_back','download_bytes','unpacked_bytes']);
 if(v.schema_version!==1||v.provider_version!==1||v.action!=='packages.upgrade_conservative.v1')fail('invalid_request',400);
 if(!Array.isArray(v.packages)||!Array.isArray(v.kept_back)||v.packages.length>maintenanceLimits.planRows||v.kept_back.length>maintenanceLimits.planRows)fail('invalid_request',400);
 const packages:PackageChange[]=v.packages.map(raw=>{
  const p=exactObject(raw,['name','architecture','installed_version','candidate_version','archive_sha256','archive_bytes','installed_bytes']);
  const key=identity({name:p.name,architecture:p.architecture});
  const version=(value:unknown)=>boundedAscii(value,/^[0-9][A-Za-z0-9.+:~_-]*$/,1024);
  return {...key,installed_version:version(p.installed_version),candidate_version:version(p.candidate_version),archive_sha256:digestText(p.archive_sha256),archive_bytes:size(p.archive_bytes),installed_bytes:size(p.installed_bytes)};
 });
 const kept_back=v.kept_back.map(raw=>{
  const p=exactObject(raw,['name','architecture','held']);if(typeof p.held!=='boolean')fail('invalid_request',400);
  return {...identity({name:p.name,architecture:p.architecture}),held:p.held};
 });
 const keys=[...packages,...kept_back].map(p=>p.name+':'+p.architecture);
 if(new Set(keys).size!==keys.length)fail('invalid_request',400);
 const sums={download_bytes:size(packages.reduce((n,p)=>n+p.archive_bytes,0)),unpacked_bytes:size(packages.reduce((n,p)=>n+p.installed_bytes,0))};
 if(sums.download_bytes!==v.download_bytes||sums.unpacked_bytes!==v.unpacked_bytes)fail('invalid_request',400);
 const plan:UpgradePlan={schema_version:1,provider_version:1,action:v.action,policy_sha256:digestText(v.policy_sha256),state_sha256:digestText(v.state_sha256),sources_sha256:digestText(v.sources_sha256),indexes_sha256:digestText(v.indexes_sha256),config_sha256:digestText(v.config_sha256),selection_sha256:digestText(v.selection_sha256),local_sha256:digestText(v.local_sha256),packages,kept_back,...sums};
 if(Buffer.byteLength(canonicalMaintenance(plan))>maintenanceLimits.planBytes)fail('invalid_request',400);
 return plan;
}
