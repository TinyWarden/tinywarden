import {operatorFleetGroup} from "@/server/http/fleet-handlers";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return operatorFleetGroup(request,(await context.params).id);}
