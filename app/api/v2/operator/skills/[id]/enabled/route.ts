import { operatorPackageEnabled } from "@/server/http/package-handlers";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return operatorPackageEnabled(request, (await context.params).id);
}
