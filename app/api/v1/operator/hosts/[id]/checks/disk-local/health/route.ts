import { operatorDiskHealth } from "@/server/http/handlers";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return operatorDiskHealth(request, (await context.params).id);
}
