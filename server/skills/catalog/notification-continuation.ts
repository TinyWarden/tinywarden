import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Selectable, Transaction } from "kysely";
import type { Database } from "../../db/types";
import type { SkillPackages, SkillInstallations, HostSkillPolicies } from "../../db/package-skill-types";
import { matchesSchema } from "../../../lib/skills/schema-values";
import { packageDirectory } from "../runtime/storage";
import { canonicalText } from "./package-commands";

// Only proofs created in this process can reach the internal continuation path.
const verified = new WeakSet<NotificationContinuation>();
export interface NotificationContinuation { oldDigest: string; nextDigest: string; identity: string }
export function assertContinuation(proof: NotificationContinuation, oldDigest: string, nextDigest: string) {
  if (!verified.has(proof) || proof.oldDigest !== oldDigest || proof.nextDigest !== nextDigest) throw new Error("unverified_notification_continuation");
}
async function files(root: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  async function visit(dir: string) {
    for (const f of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const name = path.posix.join(dir, f.name);
      if (f.isDirectory()) await visit(name);
      else if (f.isFile()) result.set(name, await readFile(path.join(root, name)));
      else throw new Error("continuation_package_path");
    }
  }
  await visit(""); return result;
}
function contentDigest(files: Map<string, Buffer>): string {
  const hash = createHash("sha256").update("tw-skill-content-v1\0");
  for (const [name, data] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const path = Buffer.from(name), length = Buffer.alloc(12);
    length.writeUInt32BE(path.length, 0); length.writeBigUInt64BE(BigInt(data.length), 4);
    hash.update(length.subarray(0, 4)).update(path).update(length.subarray(4)).update(createHash("sha256").update(data).digest());
  }
  return hash.digest("hex");
}
/** For a locally reviewed metadata-only release. Never exposed as upload/version HTTP input. */
export async function proveNotificationContinuation(old: Selectable<SkillPackages>, next: Selectable<SkillPackages>, store?: string): Promise<NotificationContinuation> {
  const a = old.metadata, b = next.metadata;
  if (old.skill_id !== next.skill_id || old.official !== next.official || !b.notifications ||
    canonicalText({ ...a.manifest, version: "" }) !== canonicalText({ ...b.manifest, version: "" }) ||
    canonicalText(a.schemas) !== canonicalText(b.schemas) || canonicalText(a.display) !== canonicalText(b.display)) throw new Error("continuation_execution_changed");
  const refs = new Set<string>();
  for (const r of b.notifications.rules) {
    refs.add(r.message_key);
    for (const p of Object.values(r.parameters)) {
      if ("catalog_key" in p.source) refs.add(p.source.catalog_key);
      if (p.plural) { refs.add(p.plural.one_key); refs.add(p.plural.other_key); }
    }
  }
  for (const [key, entry] of Object.entries(a.catalog)) if (canonicalText(entry) !== canonicalText(b.catalog[key])) throw new Error("continuation_catalog_changed");
  for (const key of Object.keys(b.catalog)) if (!Object.hasOwn(a.catalog, key) && (!key.startsWith("notify.") || !refs.has(key))) throw new Error("continuation_catalog_changed");
  const [before, after] = await Promise.all([files(packageDirectory(old.content_sha256, store)), files(packageDirectory(next.content_sha256, store))]);
  if (contentDigest(before) !== old.content_sha256 || contentDigest(after) !== next.content_sha256) throw new Error("continuation_package_digest");
  const allowed = new Set(["skill.json", "notifications.json", "messages/en.json", "README.md"]);
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    if (allowed.has(name)) continue;
    if (!before.get(name)?.equals(after.get(name) ?? Buffer.alloc(0))) throw new Error("continuation_execution_changed");
  }
  // Verify the manifest/catalog compared above are the admitted archive values, not caller substitutions.
  for (const [data, meta] of [[before, a], [after, b]] as const) {
    if (canonicalText(JSON.parse(data.get("skill.json")!.toString())) !== canonicalText(meta.manifest) ||
      canonicalText(JSON.parse(data.get("messages/en.json")!.toString())) !== canonicalText(meta.catalog) ||
      canonicalText(data.has("notifications.json") ? JSON.parse(data.get("notifications.json")!.toString()) : undefined) !== canonicalText(meta.notifications)) throw new Error("continuation_metadata_mismatch");
  }
  const proof = Object.freeze({ oldDigest: old.content_sha256, nextDigest: next.content_sha256,
    identity: createHash("sha256").update(canonicalText([1, old.content_sha256, next.content_sha256])).digest("hex") });
  verified.add(proof); return proof;
}
export async function carryNotificationContinuation(trx: Transaction<Database>, current: Selectable<SkillInstallations>, next: Selectable<SkillPackages>,
  version: string, revision: string, policies: Selectable<HostSkillPolicies>[]) {
  const agents = await trx.selectFrom("agents").select(["id", "current_generation"]).execute();
  const states = await trx.selectFrom("skill_states").selectAll().where("installation_id", "=", current.id).limit(501).forUpdate().execute();
  const cursors = await trx.selectFrom("notification_cursors").selectAll().where("subject_key", "=", current.subject_key as never)
    .where("current", "=", true).limit(501).forUpdate().execute();
  if (states.length > 500 || cursors.length > 500) throw new Error("continuation_bound_exceeded");
  for (const s of states) {
    const matches = s.generation === agents.find((a) => a.id === s.agent_id)?.current_generation &&
      s.content_sha256 === current.content_sha256 && s.enablement_version === current.enablement_version &&
      s.state_version === next.metadata.manifest.state_version && matchesSchema(next.metadata.schemas.state, s.state);
    if (matches) await trx.updateTable("skill_states").set({ content_sha256: next.content_sha256, enablement_version: version })
      .where("installation_id", "=", s.installation_id).where("agent_id", "=", s.agent_id).execute();
    else await trx.deleteFrom("skill_states").where("installation_id", "=", s.installation_id).where("agent_id", "=", s.agent_id).execute();
  }
  for (const c of cursors) {
    if (c.generation !== agents.find((a) => a.id === c.agent_id)?.current_generation || c.source_revision !== current.settings_revision ||
      c.enablement_version !== current.enablement_version || c.policy_version !== (policies.find((p) => p.host_id === c.host_id)?.version ?? "0")) continue;
    await trx.updateTable("notification_cursors").set({ source_revision: revision, enablement_version: version, suspended: true }).where("id", "=", c.id).execute();
  }
}
