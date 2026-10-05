import { operatorHosts } from "@/server/http/handlers";

export const runtime = "nodejs";
export const GET = (request: Request) => operatorHosts(request);
