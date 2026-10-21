import {operatorFleetOperationDetail} from "@/server/http/fleet-handlers";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return operatorFleetOperationDetail(request,(await context.params).id);}
