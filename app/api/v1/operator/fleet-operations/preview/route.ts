import {operatorFleetRemovalPreview} from "@/server/http/fleet-handlers";
export const runtime="nodejs";
export const POST=(request:Request)=>operatorFleetRemovalPreview(request);
