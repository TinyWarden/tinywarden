import {operatorFleetOperation,operatorFleetOperations} from "@/server/http/fleet-handlers";
export const runtime="nodejs";
export const POST=(request:Request)=>operatorFleetOperation(request);

export const GET=(request:Request)=>operatorFleetOperations(request);
