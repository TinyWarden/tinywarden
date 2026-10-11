import {agentSetup} from "@/server/http/agent-update-handlers";
export const runtime="nodejs";
export function POST(request:Request){return agentSetup(request);}
