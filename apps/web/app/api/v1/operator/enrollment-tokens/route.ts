import { operatorIssueToken } from "@/server/http/handlers";

export const runtime = "nodejs";
export const POST = (request: Request) => operatorIssueToken(request);
