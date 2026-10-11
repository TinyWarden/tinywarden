import {operatorAgentUpdates} from "@/server/http/agent-update-handlers";
export const runtime="nodejs";
export function GET(request:Request){return operatorAgentUpdates(request);}
export function POST(request:Request){return operatorAgentUpdates(request);}
