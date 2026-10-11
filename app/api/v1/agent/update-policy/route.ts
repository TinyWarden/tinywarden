import {agentUpdatePolicy} from "@/server/http/agent-update-handlers";
export const runtime="nodejs";
export function POST(request:Request){return agentUpdatePolicy(request);}
