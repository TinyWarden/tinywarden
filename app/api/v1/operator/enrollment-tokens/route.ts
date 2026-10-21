import { operatorIssueToken } from "@/server/http/handlers";

export const runtime = "nodejs";
export const POST = (request: Request) => operatorIssueToken(request);

import {operatorFleetSetups} from "@/server/http/fleet-handlers";
export const GET=(request:Request)=>operatorFleetSetups(request);
