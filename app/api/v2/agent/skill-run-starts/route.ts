import{agentManualStart}from"@/server/http/manual-handlers";
export const runtime="nodejs";
export async function POST(r:Request){return agentManualStart(r);}
