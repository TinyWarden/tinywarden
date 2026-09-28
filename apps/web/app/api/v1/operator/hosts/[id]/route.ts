import { operatorHostDetail } from "@/server/http/handlers";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return operatorHostDetail(request, id);
}
