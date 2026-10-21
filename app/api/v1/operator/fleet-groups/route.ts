import {operatorFleetGroup,operatorFleetGroups} from "@/server/http/fleet-handlers";
export const runtime="nodejs";
export const POST=(request:Request)=>operatorFleetGroup(request);

export const GET=(request:Request)=>operatorFleetGroups(request);
