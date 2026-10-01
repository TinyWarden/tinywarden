import { operatorBaselines } from "@/server/http/baseline-handlers";
export const runtime = "nodejs";
export async function GET(r: Request, ctx: { params: Promise<{ id: string }> }) { return operatorBaselines(r, (await ctx.params).id); }
