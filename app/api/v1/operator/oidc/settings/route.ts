import {oidcSettings} from "@/server/http/oidc-handlers";
export const runtime="nodejs";export const dynamic="force-dynamic";
export const GET=(r:Request)=>oidcSettings(r);
export const POST=(r:Request)=>oidcSettings(r);
