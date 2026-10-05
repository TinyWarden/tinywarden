import { operatorSkills } from "@/server/http/skill-handlers";
export const runtime = "nodejs";
export const GET = (request: Request) => operatorSkills(request);
