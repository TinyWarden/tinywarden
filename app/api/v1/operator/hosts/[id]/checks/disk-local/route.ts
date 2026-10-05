import { operatorHostDiskPolicy, operatorSetHostDiskPolicy } from "../../../../../../../../server/http/handlers";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return operatorHostDiskPolicy(request, (await context.params).id);
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return operatorSetHostDiskPolicy(request, (await context.params).id);
}
