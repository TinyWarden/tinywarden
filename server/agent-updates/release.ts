import {createHash,createPublicKey,verify} from "node:crypto";
import {validateJsonStructure} from "../http/json-structure";
export const capability="agent_updates.v1";
export const updateRequestCapability="agent_update_requests.v1";
export const appUpdateCapabilities=[capability,updateRequestCapability] as const;
export const repository="TinyWarden/tinywarden-agent";
export const releaseKey="pYjVpkuPwkZLKjGFZ4AKNopcHgEFV2CIrvhME1Gl048="; // gitleaks:allow -- public Ed25519 verification key, not a credential
const versionPattern=/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
export const digestPattern=/^[a-f0-9]{64}$/;
export function validVersion(value:unknown):value is string{return typeof value==="string"&&versionPattern.test(value);}
export function compare(a:string,b:string){if(!validVersion(a)||!validVersion(b))throw new Error("invalid_version");const x=a.split(".").map(Number),y=b.split(".").map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]!>y[i]!?1:-1;return 0;}
export interface ReleaseManifest {
  format:1;repository:string;tag:string;version:string;source_commit:string;channel:"stable";
  os:"debian";os_version:"13";architecture:"amd64";source_min:string;source_max:string;automatic:boolean;
  required_app_capabilities:string[];binary_sha256:string;runtime_sha256:string;descriptor_sha256:string;
  asset:{name:string;size:number;sha256:string};
}
export interface SignedRelease {manifest:string;signature:string}
export function closed(value:unknown,keys:string[],optional:string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid_object");
  const v=value as Record<string,unknown>;if(keys.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!keys.includes(k)&&!optional.includes(k)))throw new Error("invalid_fields");return v;
}
export function verifyRelease(bytes:Uint8Array,signature:string,publicKey=releaseKey):ReleaseManifest {
  if(bytes.byteLength<1||bytes.byteLength>16384||signature.length>256)throw new Error("release_invalid");
  const sig=Buffer.from(signature.trim(),"base64"),rawKey=Buffer.from(publicKey,"base64");
  if(sig.length!==64||sig.toString("base64")!==signature.trim()||rawKey.length!==32)throw new Error("release_invalid");
  const key=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),rawKey]),format:"der",type:"spki"});
  if(!verify(null,bytes,key,sig))throw new Error("signature_invalid");
  const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);validateJsonStructure(text);
  const m=closed(JSON.parse(text),["format","repository","tag","version","source_commit","channel","os","os_version","architecture","source_min","source_max","automatic","required_app_capabilities","binary_sha256","runtime_sha256","descriptor_sha256","asset"]);
  const a=closed(m.asset,["name","size","sha256"]);
  if(m.format!==1||m.repository!==repository||!validVersion(m.version)||m.tag!=="v"+m.version||m.channel!=="stable"||m.os!=="debian"||m.os_version!=="13"||m.architecture!=="amd64"||typeof m.source_commit!=="string"||!/^[a-f0-9]{40}$/.test(m.source_commit)||!validVersion(m.source_min)||!validVersion(m.source_max)||compare(m.source_min,m.source_max)>0||typeof m.automatic!=="boolean")throw new Error("release_invalid");
  if(![m.binary_sha256,m.runtime_sha256,m.descriptor_sha256,a.sha256].every(d=>typeof d==="string"&&digestPattern.test(d))||a.name!==`tinywarden-agent-${m.version}-linux-amd64.tar.gz`||!Number.isSafeInteger(a.size)||Number(a.size)<1||Number(a.size)>64*1024*1024)throw new Error("release_invalid");
  const caps=m.required_app_capabilities;if(!Array.isArray(caps)||caps.length<1||caps.length>8||new Set(caps).size!==caps.length||caps.some(c=>typeof c!=="string"||!/^[a-z][a-z0-9_.]{0,63}$/.test(c)))throw new Error("release_invalid");
  return m as unknown as ReleaseManifest;
}
export function supports(m:ReleaseManifest){return m.required_app_capabilities.every(c=>appUpdateCapabilities.some(s=>s===c));}
export function compatible(m:ReleaseManifest,source:string){return validVersion(source)&&compare(source,m.source_min)>=0&&compare(source,m.source_max)<=0;}
export function digest(bytes:Uint8Array){return createHash("sha256").update(bytes).digest("hex");}
