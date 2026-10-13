import {operatorAccess} from "@/server/http/access-handlers";
export const runtime="nodejs";
export async function POST(r:Request,c:{params:Promise<{id:string}>}){return operatorAccess(r,"groups",(await c.params).id,"delete");}
