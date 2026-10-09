import{operatorManualRun}from"@/server/http/manual-handlers";
export const runtime="nodejs";
export async function POST(r:Request,{params}:{params:Promise<{host:string;id:string}>}){const{host,id}=await params;return operatorManualRun(r,host,id);}
