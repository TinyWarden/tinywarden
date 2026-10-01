import { agentDiskRun } from "@/server/http/handlers";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> { return agentDiskRun(request); }
