import { agentPackageRun } from "@/server/http/package-handlers";
export const runtime = "nodejs";
export function POST(request: Request) { return agentPackageRun(request); }
