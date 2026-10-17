import {requestPasswordRecovery} from "@/server/http/account-email-handlers";
export const runtime="nodejs";export const dynamic="force-dynamic";
export const POST=(r:Request)=>requestPasswordRecovery(r);
