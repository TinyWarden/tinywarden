import { operatorBaselinePolicy, operatorSetBaselinePolicy } from "@/server/http/baseline-handlers";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; key: string }> };
export async function GET(r: Request, ctx: Context) { const p = await ctx.params; return operatorBaselinePolicy(r, p.id, p.key); }
export async function POST(r: Request, ctx: Context) { const p = await ctx.params; return operatorSetBaselinePolicy(r, p.id, p.key); }
