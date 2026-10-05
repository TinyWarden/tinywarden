import { operatorPackageVersion, operatorPackageVersions } from "@/server/http/package-handlers";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return operatorPackageVersion(request, (await params).id);
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return operatorPackageVersions(request, (await params).id);
}
