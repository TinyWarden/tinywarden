import {agentUpdateRequests} from "@/server/http/agent-update-handlers";
export const runtime="nodejs";
export function POST(request:Request){return agentUpdateRequests(request);}
