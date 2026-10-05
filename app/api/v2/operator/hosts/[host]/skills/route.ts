import { operatorPackageResults } from "@/server/http/package-handlers";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ host: string }> }) {
  return operatorPackageResults(request, (await context.params).host);
}
