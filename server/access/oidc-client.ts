import * as client from 'openid-client';
import {fail} from '../errors';
import {oidcUrl} from './oidc-configuration';
import type {Selectable} from 'kysely';
import type {OidcProvider} from '../db/identity-types';
/** Administrators deliberately authorize an HTTPS issuer, including a private
 * homelab issuer. Endpoint origins must match it; credentials cannot follow a
 * metadata-driven cross-origin request or a redirect. */
export async function oidcConfiguration(provider:Selectable<OidcProvider>,secret:string,fetcher:typeof fetch=fetch){
 const origin=oidcUrl(provider.issuer).origin;
 const bounded:client.CustomFetch=async(input,init)=>{
  if(oidcUrl(String(input)).origin!==origin)fail('oidc_invalid_endpoint',400);
  const timeout=AbortSignal.timeout(5000),signal=init?.signal?AbortSignal.any([init.signal,timeout]):timeout;
  const response=await fetcher(input,{...init,body:init.body instanceof Uint8Array?new Uint8Array(init.body):init.body??null,redirect:'error',signal});
  if(Number(response.headers.get('content-length'))>256*1024)fail('oidc_unavailable',503);
  const reader=response.body?.getReader();if(!reader)return response;let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>256*1024)fail('oidc_unavailable',503);chunks.push(part.value);}}
  finally{await reader.cancel().catch(()=>{});}
  return new Response(Buffer.concat(chunks),{status:response.status,headers:response.headers});
 };
 const config=await client.discovery(new URL(provider.issuer),provider.client_id,{client_secret:secret,id_token_signed_response_alg:'RS256'},client.ClientSecretPost(secret),{[client.customFetch]:bounded,timeout:5,execute:[client.enableNonRepudiationChecks]});
 const metadata=config.serverMetadata();
 for(const endpoint of [metadata.authorization_endpoint,metadata.token_endpoint,metadata.jwks_uri,metadata.userinfo_endpoint]){
  if(endpoint&&oidcUrl(endpoint).origin!==origin)fail('oidc_invalid_endpoint',400);
 }
 if(!metadata.authorization_endpoint||!metadata.token_endpoint||!metadata.jwks_uri)fail('oidc_unavailable',503);
 return config;
}
