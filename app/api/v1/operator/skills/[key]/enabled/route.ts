import { operatorSkillEnabled } from "@/server/http/skill-handlers";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  return operatorSkillEnabled(request, (await params).key);
}
