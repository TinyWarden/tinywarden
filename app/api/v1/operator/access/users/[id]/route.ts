import {operatorAccess} from "@/server/http/access-handlers";
export const runtime="nodejs";
type C={params:Promise<{id:string}>};
export async function GET(r:Request,c:C){return operatorAccess(r,"users",(await c.params).id);}
export async function POST(r:Request,c:C){return operatorAccess(r,"users",(await c.params).id);}
