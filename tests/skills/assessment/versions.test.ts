import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { assessBaseline } from "../../../server/skills/legacy/shared/assessment";
import { baselineKeys, evaluators } from "../../../server/skills/legacy/shared/types";
import { historyDayWindow } from "../../../server/history/day-window";
import { dashboardOptions } from "../../../server/fleet/dashboard-model";
import { historyOptions } from "../../../server/history/reads";
import { filterIdentity } from "../../../server/history/options";
import { notificationFixture, url } from "../../p4b.fixture";
import { sample } from "../../p4a.fixture";
import messages from "../../../messages/en.json";

const directory = fileURLToPath(new URL("../../fixtures/agent/internal/baseline/testdata", import.meta.url));
describe("scoped assessments and calendar boundaries", () => {
  it("preserves every legacy fixture and changes only the two approved clean meanings", () => {
    for (const key of baselineKeys) for (const file of readdirSync(join(directory, key)).filter((name) => name.endsWith(".json"))) {
      const fixture = JSON.parse(readFileSync(join(directory, key, file), "utf8"));
      expect(assessBaseline(fixture.expected, evaluators[key], 1)).toEqual(fixture.assessment);
      const v2 = assessBaseline(fixture.expected, evaluators[key], 2);
      const clean = ["package_cache_unverified", "reboot_assurance_unverified"].includes(fixture.assessment.reason);
      expect(v2.state).toBe(clean ? "healthy" : fixture.assessment.state);
      if (clean) expect(v2).toMatchObject({ incomplete: true, informational: true });
      expect(assessBaseline(fixture.expected, evaluators[key], 4).state).toBe("unknown");
    }
  });
  it.each([
    ["2026-10-03T09:00:00.000Z", "2026-10-02T21:00:00.000Z", 24],
    ["2026-03-29T09:00:00.000Z", "2026-03-28T22:00:00.000Z", 23],
    ["2026-10-25T09:00:00.000Z", "2026-10-24T21:00:00.000Z", 25],
  ])("uses Bucharest midnight on %s", (instant, start, hours) => {
    const window = historyDayWindow(new Date(instant));
    expect(window.start.toISOString()).toBe(start);
    expect((window.next.getTime() - window.start.getTime()) / 3600000).toBe(hours);
  });
  it("binds cursors to the requested group/host and rejects duplicate options", () => {
    const id = "00000000-0000-4000-8000-000000000001", at = "2026-10-03T09:00:00.000Z";
    const cursor = Buffer.from(JSON.stringify(["healthy", 3, at, id])).toString("base64url");
    expect(() => dashboardOptions(`?unknown=${cursor}`)).toThrow();
    expect(() => dashboardOptions(`?healthy=${cursor}&healthy=${cursor}`)).toThrow();
    const eventCursor = Buffer.from(JSON.stringify([filterIdentity({ limit: 25, host: id }), at, id])).toString("base64url");
    expect(() => historyOptions(`?cursor=${eventCursor}`)).toThrow();
    expect(historyOptions(`?host=${id}&cursor=${eventCursor}`).after?.id).toBe(id);
  });
});

describe.skipIf(!url)("scoped recovery consumer", () => {
  it("captures a same-source package recovery with its assurance limit", async () => {
    const f = await notificationFixture();
    try {
      await f.run(sample("package-updates", f.baselines[0]!, f.clock(), 1));
      await f.tick();
      await f.advanceSeconds(60);
      const clean = sample("package-updates", f.baselines[0]!, f.clock(), 2);
      Object.assign(clean.observation.packages, { upgraded: 0, installed: 0, removed: 0, held_back: 0 });
      expect((await f.run(clean)).status).toBe(200);
      await f.tick();
      const events = await f.db.selectFrom("notification_outbox as e").innerJoin("notification_cursors as c", "c.id", "e.cursor_id")
        .select(["e.to_state", "e.state"]).where("c.subject_key", "=", "package-updates").orderBy("e.created_at").execute();
      expect(events.map((event) => [event.to_state, event.state])).toEqual([["warning", "captured"], ["healthy", "captured"]]);
      const mail = f.captured.at(-1)!.toString().replace(/=\r\n/g, "");
      expect(mail).toContain(messages.notifications.limits["package-updates"]);
    } finally { await f.db.destroy(); }
  });
});
