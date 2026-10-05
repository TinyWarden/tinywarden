import { operatorHistory } from "@/server/http/dashboard-handlers";
export const runtime = "nodejs";
export const GET = (request: Request) => operatorHistory(request);
