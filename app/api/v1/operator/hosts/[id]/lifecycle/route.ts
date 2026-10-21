import {operatorFleetLifecycle} from "@/server/http/fleet-handlers";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return operatorFleetLifecycle(request,(await context.params).id);}
