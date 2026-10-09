import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, chmod, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pinned from "./fixtures/official-packages.json";
import { notificationFixture, url, database } from "../../p4b.fixture";
import { sample } from "../../p4a.fixture";
import { importSkillDirectory } from "../../../server/skills/catalog/package-install";
import { setPackageEnabled } from "../../../server/skills/catalog/package-controls";
import { proveNotificationContinuation } from "../../../server/skills/catalog/notification-continuation";
import { selectPackageVersion } from "../../../server/skills/catalog/package-version";
import { fetchPackageAssignments } from "../../../server/skills/assignments/packages";
import { acceptPackageRun } from "../../../server/skills/results/package-runs";
import { packageProjections } from "../../../server/skills/results/package-projection";
import { sampleFamily } from "../../../server/notifications/sampling";
import { withNotificationLock } from "../../../server/notifications/lock";
async function remove(root: string) { await chmod(root, 0o700); for (const e of await readdir(root, { withFileTypes: true })) if (e.isDirectory()) await remove(path.join(root, e.name)); await rm(root, { recursive: true, force: true }); }
describe.skipIf(!url)("N1 metadata-only package continuation", () => {
  it("keeps trim reducer state, sequence and incident exposure; waits for a real reading; ordinary selection resets", async () => {
    const f = await notificationFixture(), root = await mkdtemp(path.join(tmpdir(), "tw-n1-")), store = path.join(root, "store");
    try {
      for (const version of ["old", "next"]) {
        const source = path.join(root, version); await mkdir(source);
        for (const [name, data] of Object.entries(pinned.packages["fstrim-status"].files)) {
          if (version === "old" && name === "notifications.json") continue;
          let text = data;
          if (version === "old" && name === "skill.json") { const m = JSON.parse(text); m.version = "1.1.0"; text = JSON.stringify(m); }
          if (version === "old" && name === "messages/en.json") text = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(text)).filter(([k]) => !k.startsWith("notify."))));
          await mkdir(path.dirname(path.join(source, name)), { recursive: true }); await writeFile(path.join(source, name), text);
        }
      }
      const old = await importSkillDirectory(f.db, f.session, { request_id: randomUUID(), directory: path.join(root, "old"), official: true }, f.clock, store);
      const artifact = await f.db.selectFrom("skill_packages").selectAll().where("content_sha256", "=", old.content_sha256).executeTakeFirstOrThrow();
      await setPackageEnabled(f.db, f.session, old.installation_id, { request_id: randomUUID(), expected_enablement_version: "1", content_sha256: old.content_sha256, enabled: true, grants: artifact.metadata.manifest.capabilities }, f.clock);
      const assignment = (await fetchPackageAssignments(f.db, f.agentCredential, true, f.clock)).assignments[0]!;
      const golden = sample("fstrim-status", f.baselines.find((b) => b.definition_key === "fstrim-status")!, f.clock(), 1);
      const observation = JSON.parse(JSON.stringify(golden.observation.fstrim));
      const now = Math.floor(+f.clock() / 1000); observation.timer.next_elapse = now - 86401;
      observation.timer.last_trigger = now - 86402; observation.service = { load_state: "loaded", active_state: "inactive", result: "success", exit_kind: 0, exit_status: 0, condition: {} };
      const run = (id: string, sequence: number) => ({ run_id: randomUUID(), run_sequence: sequence, assignment_id: id, started_at: new Date(+f.clock() - 2000).toISOString(), finished_at: new Date(+f.clock() - 1000).toISOString(), outcome: "observed" as const, observation: { problem: "none", ...observation } });
      await acceptPackageRun(f.db, f.agentCredential, run(assignment.assignment_id!, 1), f.clock, store);
      const state = await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow();
      expect(state.state).toHaveProperty("expected_at", now - 86401);
      await withNotificationLock(f.db, database, (db) => sampleFamily(db, f.routeId, f.settings, f.hostId, "fstrim-status", f.clock));
      await f.tick();
      const cursor = await f.db.selectFrom("notification_cursors").selectAll().where("subject_key", "=", "fstrim-status").where("current", "=", true).executeTakeFirstOrThrow();
      expect(cursor).toMatchObject({ last_state: "warning", exposed: true });
      const imported = await importSkillDirectory(f.db, f.session, { request_id: randomUUID(), directory: path.join(root, "next"), official: true }, f.clock, store);
      const next = await f.db.selectFrom("skill_packages").selectAll().where("content_sha256", "=", imported.content_sha256).executeTakeFirstOrThrow();
      const proof = await proveNotificationContinuation(artifact, next, store), input = { request_id: randomUUID(), content_sha256: next.content_sha256, expected_enablement_version: "2", grants: next.metadata.manifest.capabilities };
      const result = await withNotificationLock(f.db, database, (db) => selectPackageVersion(db, f.session, old.installation_id, input, f.clock, store, proof));
      const carried = await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow();
      expect({ ...carried, content_sha256: state.content_sha256, enablement_version: state.enablement_version }).toEqual(state);
      expect((await f.db.transaction().execute((trx) => packageProjections(trx, [f.hostId], f.clock())))[0]).toMatchObject({ state: "unknown", measured_at: null });
      const advanced = await f.db.selectFrom("notification_cursors").selectAll().where("id", "=", cursor.id).executeTakeFirstOrThrow();
      expect({ ...advanced, source_revision: cursor.source_revision, enablement_version: cursor.enablement_version, suspended: cursor.suspended }).toEqual(cursor);
      const fresh = (await fetchPackageAssignments(f.db, f.agentCredential, true, f.clock)).assignments[0]!;
      await f.advanceSeconds(60); await acceptPackageRun(f.db, f.agentCredential, run(fresh.assignment_id!, 2), f.clock, store);
      expect(await selectPackageVersion(f.db, f.session, old.installation_id, input, f.clock, store, proof)).toEqual(result);
      expect((await f.db.selectFrom("skill_states").selectAll().executeTakeFirstOrThrow()).last_sequence).toBe("2");
      await f.tick(); expect(f.captured).toHaveLength(1);
      expect((await f.db.transaction().execute((trx) => packageProjections(trx, [f.hostId], f.clock())))[0]!.assessment?.reason.key).toBe("fstrim_result_overdue");
      await selectPackageVersion(f.db, f.session, old.installation_id, { ...input, request_id: randomUUID(), content_sha256: old.content_sha256, expected_enablement_version: "3" }, f.clock, store);
      expect(await f.db.selectFrom("skill_states").selectAll().execute()).toHaveLength(0);
      await expect(proveNotificationContinuation(artifact, { ...next, metadata: { ...next.metadata, manifest: { ...next.metadata.manifest, limits: { wall_seconds: 59 } } } }, store)).rejects.toThrow("execution_changed");
    } finally { await f.db.destroy(); await remove(root); }
  }, 60000);
});
