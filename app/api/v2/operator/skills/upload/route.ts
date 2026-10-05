import { operatorPackageUpload } from "@/server/http/package-handlers";
export const runtime = "nodejs";
export function POST(request: Request) { return operatorPackageUpload(request); }
