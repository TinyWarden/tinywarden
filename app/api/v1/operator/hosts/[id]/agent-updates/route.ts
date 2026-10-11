import {operatorAgentUpdates} from "@/server/http/agent-update-handlers";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){return operatorAgentUpdates(request,(await params).id);}
export async function POST(request:Request,{params}:Context){return operatorAgentUpdates(request,(await params).id);}
