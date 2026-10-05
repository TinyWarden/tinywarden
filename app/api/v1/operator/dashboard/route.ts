import { operatorDashboard } from "@/server/http/dashboard-handlers";
export const runtime = "nodejs";
export const GET = (request: Request) => operatorDashboard(request);
