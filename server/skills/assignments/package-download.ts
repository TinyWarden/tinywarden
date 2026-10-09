import { recordAgentContact } from "../../fleet/contact-evidence";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { authorizeAgent } from "../../fleet/agent-authority";
import { fail } from "../../errors";
import { uuid } from "../../validation";
import { packageLock, type PackageDb } from "../catalog/package-commands";
import { packageStore } from "../runtime/storage";
import { MAX_SKILL_ZIP } from "../catalog/package-upload";
let transfers=0;

function transfer(data:Buffer,headers:HeadersInit){
  let position=0,closed=false,timer:NodeJS.Timeout;
  const close=()=>{if(!closed){closed=true;clearTimeout(timer);transfers--;}};
  const body=new ReadableStream<Uint8Array>({
    start(controller){timer=setTimeout(()=>{controller.error(new Error("transfer_timeout"));close();},15000);},
    pull(controller){if(closed)return;if(position===data.length){controller.close();close();return;}
      const end=Math.min(position+65536,data.length);controller.enqueue(data.subarray(position,end));position=end;},
    cancel(){close();},
  });
  return new Response(body,{headers});
}

export async function downloadSkill(db: PackageDb, credential: string, rawId: string, clock: () => Date, store = packageStore) {
  const id = uuid(rawId);
  if(transfers>=4)fail("temporarily_unavailable",503);
  transfers++;
  let returned=false;
  try { const response=await db.transaction().execute(async (trx) => {
    await packageLock(trx);
    const authority = await authorizeAgent(trx, credential, clock);
    const { host, agent, now } = authority;
    const assignment = await trx.selectFrom("skill_assignments").selectAll().where("id", "=", id)
      .where("host_id", "=", host.id).where("agent_id", "=", agent.id).where("generation", "=", agent.current_generation).executeTakeFirst();
    if (!assignment || assignment.valid_until <= now) fail("assignment_unknown", 409);
    const i = await trx.selectFrom("skill_installations").selectAll().where("id", "=", assignment.installation_id).executeTakeFirst();
    const policy = await trx.selectFrom("host_skill_policies").selectAll().where("host_id", "=", host.id).where("installation_id", "=", assignment.installation_id).executeTakeFirst();
    if (!i?.enabled || i.content_sha256 !== assignment.content_sha256 || i.enablement_version !== assignment.enablement_version ||
      i.settings_revision !== assignment.settings_revision || (policy?.version ?? "0") !== assignment.policy_version) fail("assignment_unknown", 409);
    const p = await trx.selectFrom("skill_packages").selectAll().where("content_sha256", "=", i.content_sha256).executeTakeFirstOrThrow();
    const archive = p.metadata.archive;
    if (!archive || !/^[0-9a-f]{64}$/.test(archive.sha256) || archive.size > MAX_SKILL_ZIP) fail("temporarily_unavailable", 503);
    const file = await open(path.join(store, ".archives", `${i.content_sha256}.zip`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size !== archive.size || stat.size > MAX_SKILL_ZIP) fail("temporarily_unavailable", 503);
      const data = await file.readFile();
      if (data.length !== archive.size || createHash("sha256").update(data).digest("hex") !== archive.sha256) fail("temporarily_unavailable", 503);
    await recordAgentContact(trx, authority);
      return {data,headers:{ "Content-Type": "application/zip", "Content-Length": String(data.length),
        "X-TinyWarden-Archive-SHA256": archive.sha256, "X-TinyWarden-Content-SHA256": i.content_sha256,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }};
    } finally { await file.close(); }
  });
  const result=transfer(response.data,response.headers);returned=true;return result;
  }finally{if(!returned)transfers--;}
}
