import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { notificationFixture, database, url } from "./p4b.fixture";
import { runHistory } from "../server/history/run";
import { historyOptions, readHistory } from "../server/history/reads";
import { validChanges } from "../components/operator/read-validation";
import { dayLabel } from "../app/history/history-format";

describe("U4 filter inputs and calendar labels", () => {
  it("rejects ambiguous, unbounded and invalid filters", () => {
    const id = randomUUID();
    for (const search of ["?skills=bogus", "?skills=disk-local,disk-local", "?kind=baseline", "?host=", "?hosts=", "?limit=51",
      `?hosts=${id},${id}`, `?host=${id}&hosts=${id}`, "?kind=state&kind=gap", "?server_search=" + "a".repeat(81),
      "?server_search=%00", "?cursor=broken", `?hosts=${Array.from({ length: 51 }, () => randomUUID()).join(",")}`])
      expect(() => historyOptions(search)).toThrow();
  });
  it("uses Bucharest calendar days through daylight saving and year changes", () => {
    expect(dayLabel("2026-10-24T21:30:00.000Z", "2026-10-25T22:30:00.000Z")).toBe("Yesterday");
    expect(dayLabel("2026-12-31T21:00:00.000Z", "2026-12-31T23:00:00.000Z")).toBe("Yesterday");
    expect(dayLabel("2026-03-28T22:30:00.000Z", "2026-03-29T20:00:00.000Z")).toBe("Today");
  });
});
describe.skipIf(!url)("U4 authorized retained-window history filters", () => {
  let f: Awaited<ReturnType<typeof notificationFixture>>, other: string, literal: string;
  beforeAll(async () => {
    f = await notificationFixture(); await f.diskState(1, 90); await runHistory(f.db, database, f.clock);
    const original = await f.db.selectFrom("hosts").selectAll().where("id", "=", f.hostId).executeTakeFirstOrThrow();
    other = randomUUID(); literal = randomUUID();
    await f.db.insertInto("hosts").values([{ ...original, id: other, label: "second-server" },
      { ...original, id: literal, label: "literal%_server" },
      ...Array.from({ length: 105 }, (_, n) => ({ ...original, id: randomUUID(), label: `zero-${String(n).padStart(3, "0")}` }))]).execute();
    const template = await f.db.selectFrom("history_subjects").selectAll().where("host_id", "=", f.hostId).where("subject_key", "=", "disk-local").executeTakeFirstOrThrow();
    let transition = 0;
    for (const host of [f.hostId, other]) for (const key of ["disk-local", "package-updates"] as const) {
      const cursor = host === f.hostId && key === "disk-local" ? template.id : randomUUID();
      if (cursor !== template.id) {
        // Existing first-host subjects are already seeded by capture.
        const seeded = await f.db.selectFrom("history_subjects").selectAll().where("host_id", "=", host).where("subject_key", "=", key).executeTakeFirst();
        if (seeded) await f.db.deleteFrom("history_subjects").where("id", "=", seeded.id).execute();
        await f.db.insertInto("history_subjects").values({ ...template, id: cursor, host_id: host, subject_key: key, agent_id: null, generation: null }).execute();
      }
      for (let n = 0; n < 12; n++) await f.db.insertInto("history_events").values({
        id: randomUUID(), cursor_id: cursor, host_id: host, subject_key: key, epoch: template.epoch,
        agent_id: null, generation: null, source_revision: 1, policy_version: 1, assessment_version: 2,
        transition_number: ++transition, kind: n % 3 === 0 ? "gap" : n % 3 === 1 ? "context" : "state",
        from_state: "healthy", to_state: "warning", from_reason: "none", to_reason: "none",
        previous_sample_at: new Date(f.clock().getTime() - 60000), observed_at: f.clock(), measured_at: f.clock(),
        after_gap: n % 3 === 0, previous_scope: null, before_facts: null, after_facts: null,
      }).execute();
    }
    const event = await f.db.selectFrom("history_events").selectAll().executeTakeFirstOrThrow();
    for (const offset of [-1, 0, 90 * 86400000 + 1]) {
      const at = new Date(f.cutoff().getTime() + offset);
      await f.db.insertInto("history_events").values({ ...event, id: randomUUID(), transition_number: ++transition,
        observed_at: at, previous_sample_at: null, measured_at: null, kind: "state" }).execute();
    }
  });
  afterAll(async () => { await f?.db.destroy(); });
  const read = (search = "") => readHistory(f.db, f.session, historyOptions(search), f.clock);
  it("counts all matching retained events, applies combined filters and excludes expired/future records", async () => {
    const all = await read("?limit=1");
    expect(all.events).toHaveLength(1); expect(all.filters.totals.events).toBe(49);
    expect(all.filters.servers).toHaveLength(100); expect(all.filters.server_matches).toBe(108);
    expect(all.filters.skills.reduce((n, s) => n + s.count, 0)).toBe(49);
    const view = await read(`?hosts=${other},${f.hostId}&skills=package-updates&kind=state&limit=1`);
    expect(view.filters.totals).toEqual({ events: 8, servers: 2, skills: 1 });
    expect(view.events[0]).toMatchObject({ subject_key: "package-updates", kind: "state" });
    expect(validChanges({ schema_version: 1, ...view })).toBe(true);
    const oldLink = await read(`?host=${other}&skills=disk-local&kind=context`);
    expect(oldLink.events).toHaveLength(4); expect(oldLink.events.every((e) => e.host_id === other)).toBe(true);
    const empty = await read("?skills=fstrim-status"); expect(empty.events).toHaveLength(0); expect(empty.filters.totals.events).toBe(0);
  });
  it("binds stable equal-time pagination to canonical filters and preserves choices independent of those filters", async () => {
    const base = `?hosts=${other},${f.hostId}&skills=package-updates,disk-local&kind=gap&limit=5`;
    const first = await read(base), cursor = first.next_cursor!;
    const second = await read(`?hosts=${f.hostId},${other}&skills=disk-local,package-updates&kind=gap&limit=5&cursor=${cursor}`);
    expect(new Set([...first.events, ...second.events].map((e) => e.id)).size).toBe(10);
    expect(first.filters.totals.events).toBe(16);
    for (const query of [`?hosts=${other}&skills=package-updates,disk-local&kind=gap`,
      `?hosts=${other},${f.hostId}&skills=package-updates&kind=gap`, `?hosts=${other},${f.hostId}&skills=disk-local,package-updates&kind=state`])
      expect(() => historyOptions(query + "&cursor=" + cursor)).toThrow();
    expect((await read("?kind=context")).filters.skills).toEqual(first.filters.skills);
    const selectedZero = await read(`?hosts=${literal}`); expect(selectedZero.filters.servers[0]!.id).toBe(literal);
  });
  it("searches beyond the bounded choices with literal text and keeps authorization checks", async () => {
    const view = await read("?server_search=ZERO-104");
    expect(view.filters.server_matches).toBe(1); expect(view.filters.servers[0]!.label).toBe("zero-104");
    expect((await read("?server_search=%25_")).filters.servers.map((s) => s.id)).toEqual([literal]);
    await expect(readHistory(f.db, "invalid", historyOptions("?server_search=zero"), f.clock)).rejects.toThrow("unauthorized");
    await expect(read(`?hosts=${randomUUID()}`)).rejects.toThrow("not_found");
    let calls = 0;
    await expect(readHistory(f.db, f.session, { limit: 1 }, () => new Date(f.clock().getTime() + (calls++ ? 1800001 : 0)))).rejects.toThrow("unauthorized");
  });
});
