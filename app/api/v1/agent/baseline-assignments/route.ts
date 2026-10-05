import { agentBaselineAssignments } from "@/server/http/baseline-handlers";
export const runtime = "nodejs";
export function POST(r: Request) { return agentBaselineAssignments(r); }
