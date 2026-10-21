import {consumeAuthority} from "./authority";
import {permissionEvent} from "./use-operator-read";
/** A POST preview is read-only and does not reserve a mutation request identity. */
export async function postOperatorRead(url:string,body:Record<string,unknown>,signal:AbortSignal){
 const response=await fetch(url,{method:'POST',credentials:'same-origin',signal,headers:{'Content-Type':'application/json','X-TinyWarden-Request':'1'},body:JSON.stringify({schema_version:1,...body})});
 if(response.status===401)document.dispatchEvent(new Event(permissionEvent));
 const value=await response.json();if(!response.ok)throw new Error(value.error?.code??'read_failed');consumeAuthority(value);return value as unknown;
}
