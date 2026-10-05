import { operatorPackageSkills } from "@/server/http/package-handlers";
export const runtime = "nodejs";
export function GET(request: Request) { return operatorPackageSkills(request); }
