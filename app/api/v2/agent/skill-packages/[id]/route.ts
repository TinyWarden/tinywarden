import { agentPackageDownload } from "@/server/http/package-handlers";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentPackageDownload(request, (await params).id);
}
