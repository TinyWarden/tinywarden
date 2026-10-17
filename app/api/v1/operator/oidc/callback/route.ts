import {oidcCallback} from "@/server/http/oidc-handlers";
export const runtime="nodejs";export const dynamic="force-dynamic";
export const GET=(r:Request)=>oidcCallback(r);
