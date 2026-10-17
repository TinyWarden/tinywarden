import {oidcUnlink} from "@/server/http/oidc-handlers";
export const runtime="nodejs";export const dynamic="force-dynamic";
export const POST=(r:Request)=>oidcUnlink(r);
