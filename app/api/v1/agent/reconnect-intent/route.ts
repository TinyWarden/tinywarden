import {agentReconnectIntent} from "@/server/http/agent-update-handlers";
export const runtime="nodejs";
export const POST=(request:Request)=>agentReconnectIntent(request);
