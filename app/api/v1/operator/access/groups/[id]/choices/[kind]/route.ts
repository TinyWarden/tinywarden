import {operatorAccessChoices} from "@/server/http/access-handlers";
export const runtime="nodejs";
export async function GET(r:Request,c:{params:Promise<{id:string;kind:string}>}){const p=await c.params;return operatorAccessChoices(r,"groups",p.id,p.kind);}
