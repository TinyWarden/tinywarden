import {oidcStart} from "@/server/http/oidc-handlers";
export const runtime="nodejs";export const dynamic="force-dynamic";
export const POST=(r:Request)=>oidcStart(r);
