import {accountMailOptions} from "@/server/http/account-email-handlers";
export const runtime="nodejs";export const dynamic="force-dynamic";
export const GET=(r:Request)=>accountMailOptions(r);
