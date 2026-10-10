import { parseCredential, sameDigest } from "../validation";
import { fail } from "../errors";
import { bearer, readJson, type HttpContext } from "./response";

// Authenticate a small header before accepting a potentially slow body. This
// read does not hold locks while waiting; command transactions recheck authority.
export async function readAgentJson(request: Request, ctx: HttpContext,
  limit = 16*1024, strict = false, enrollment = false) {
  const auth = parseCredential(enrollment ? "enrollment" : "agent", bearer(request));
  if (enrollment) {
    const token = await ctx.db.selectFrom("enrollment_tokens").select(["secret_digest","revoked_at"])
      .where("id","=",auth.id).executeTakeFirst();
    if (!token || token.revoked_at || !sameDigest(token.secret_digest,auth.digest)) fail("unauthorized",401);
  } else {
    const row = await ctx.db.selectFrom("agent_credentials as c").innerJoin("agents as a","a.id","c.agent_id")
      .select(["c.secret_digest","c.revoked_at as credential_revoked","a.revoked_at as agent_revoked",
        "c.generation","a.current_generation"]).where("c.id","=",auth.id).executeTakeFirst();
    if (!row || row.credential_revoked || row.agent_revoked || row.generation!==row.current_generation ||
      !sameDigest(row.secret_digest,auth.digest)) fail("unauthorized",401);
  }
  return readJson(request,limit,strict,true);
}
