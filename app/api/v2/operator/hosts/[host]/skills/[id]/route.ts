import { operatorPackagePolicy, operatorSetPackagePolicy } from "@/server/http/package-handlers";
export const runtime = "nodejs";
type Params = { params: Promise<{ host: string; id: string }> };
export async function GET(request: Request, context: Params) {
  const { host, id } = await context.params; return operatorPackagePolicy(request, host, id);
}
export async function POST(request: Request, context: Params) {
  const { host, id } = await context.params; return operatorSetPackagePolicy(request, host, id);
}
