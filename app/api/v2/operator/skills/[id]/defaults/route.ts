import { operatorPackageDefaults } from "@/server/http/package-handlers";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return operatorPackageDefaults(request, (await context.params).id);
}
