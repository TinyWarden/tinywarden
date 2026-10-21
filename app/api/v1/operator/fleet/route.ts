import {operatorFleet} from "@/server/http/fleet-handlers";
export const runtime="nodejs";
export const GET=(request:Request)=>operatorFleet(request);
