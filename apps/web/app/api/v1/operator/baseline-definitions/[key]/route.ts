import { operatorBaselineDefinition, operatorUpdateBaselineDefinition } from "@/server/http/baseline-handlers";
export const runtime = "nodejs";
type Context = { params: Promise<{ key: string }> };
export async function GET(r: Request, ctx: Context) { return operatorBaselineDefinition(r, (await ctx.params).key); }
export async function POST(r: Request, ctx: Context) { return operatorUpdateBaselineDefinition(r, (await ctx.params).key); }
