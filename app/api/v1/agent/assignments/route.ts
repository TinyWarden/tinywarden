import { agentAssignments } from "../../../../../server/http/handlers";

export async function POST(request: Request): Promise<Response> { return agentAssignments(request); }
