import { operatorSession } from "@/server/http/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => operatorSession(request);
