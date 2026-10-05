import { operatorRevokeAgent } from "@/server/http/handlers";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return operatorRevokeAgent(request, id);
}
