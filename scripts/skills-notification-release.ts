import { readFile, stat } from "node:fs/promises";
import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import { assertDatabaseTarget } from "../server/db/target";
import { requireCurrentLedger } from "../server/db/ledger";
import { newCredential, uuid } from "../server/validation";
import { withNotificationLock } from "../server/notifications/lock";
import { proveNotificationContinuation, type NotificationContinuation } from "../server/skills/catalog/notification-continuation";
import type { Selectable } from "kysely";
import type { SkillPackages } from "../server/db/package-skill-types";
import { selectPackageVersion } from "../server/skills/catalog/package-version";
import messages from "../messages/en.json";

interface Item { installation_id: string; old_digest: string; next_digest: string; request_id: string; expected_enablement_version: string }
/** Privileged release tool for the four reviewed unchanged collectors, not package-provided authority. */
async function main() {
  const [expected, plan, extra] = process.argv.slice(2);
  if (!expected || !plan || extra) throw new Error("usage");
  const info = await stat(plan);
  if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) throw new Error("release_plan_permissions");
  const items: Item[] = JSON.parse(await readFile(plan, "utf8"));
  if (!Array.isArray(items) || items.length !== 4 || new Set(items.map((i) => i.installation_id)).size !== 4) throw new Error("release_plan");
  for (const i of items) {
    if (Object.keys(i).sort().join(",") !== "expected_enablement_version,installation_id,next_digest,old_digest,request_id" ||
      !/^[0-9a-f]{64}$/.test(i.old_digest) || !/^[0-9a-f]{64}$/.test(i.next_digest) || !/^[1-9][0-9]*$/.test(i.expected_enablement_version)) throw new Error("release_plan");
    uuid(i.installation_id); uuid(i.request_id);
  }
  const db = createDb(parseDatabaseUrl(process.env.DATABASE_URL, "tinywarden")), session = newCredential("session");
  try {
    await assertDatabaseTarget(db, expected); await requireCurrentLedger(db);
    const checked: { item: Item; next: Selectable<SkillPackages>; proof: NotificationContinuation }[] = [];
    const aliases = new Set(["disk-local", "package-updates", "reboot-required", "fstrim-status"]);
    for (const item of items) {
      const old = await db.selectFrom("skill_packages").selectAll().where("content_sha256", "=", item.old_digest).executeTakeFirstOrThrow();
      const next = await db.selectFrom("skill_packages").selectAll().where("content_sha256", "=", item.next_digest).executeTakeFirstOrThrow();
      if (!old.official || !next.official || !old.metadata.manifest.alias || !aliases.delete(old.metadata.manifest.alias)) throw new Error("release_unreviewed_collector");
      checked.push({ item, next, proof: await proveNotificationContinuation(old, next) });
    }
    const at = new Date(), operator = await db.selectFrom("operators").select(["id", "auth_version"]).executeTakeFirstOrThrow();
    await db.insertInto("operator_sessions").values({ id: session.id, operator_id: operator.id, secret_digest: session.digest,
      auth_version: operator.auth_version, issued_at: at, last_seen_at: at, expires_at: new Date(at.getTime() + 10 * 60000) }).execute();
    const result = await withNotificationLock(db, expected, async (connection) => {
      const result = [];
      for (const { item, next, proof } of checked) result.push(await selectPackageVersion(connection, session.value, item.installation_id,
        { request_id: item.request_id, content_sha256: item.next_digest, expected_enablement_version: item.expected_enablement_version,
          grants: next.metadata.manifest.capabilities }, () => new Date(), undefined, proof));
      return result;
    });
    if (!Array.isArray(result)) throw new Error("release_busy");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await db.deleteFrom("operator_sessions").where("id", "=", session.id).execute(); await db.destroy(); }
}
main().catch(() => { process.stderr.write(`${messages.notificationsCli.failed}\n`); process.exitCode = 1; });
