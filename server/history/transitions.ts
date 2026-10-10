import { randomUUID } from "node:crypto";
import type { Selectable, Transaction } from "kysely";
import type { Database } from "../db/types";
import type { HistorySubjects } from "../db/history-types";
import { retentionCutoff } from "../skills/results/retention-policy";
import { historyScope, historyContinuityMs, type HistorySample } from "./types";
import { safeHistoryFacts } from "./facts";

export async function recordHistorySample(trx: Transaction<Database>, epoch: string, sample: HistorySample) {
  const at = new Date(sample.as_of);
  if (!Number.isFinite(at.getTime()) || !/^[a-z_]{1,80}$/.test(sample.reason)) throw new Error("invalid_history_sample");
  const facts = safeHistoryFacts(sample.facts);
  if (sample.facts && !facts) {
    sample = { ...sample, state: "unknown", reason: "invalid_evidence", facts: {}, suspend: true };
  }
  const old = await trx.selectFrom("history_subjects").selectAll().where("host_id", "=", sample.host_id)
    .where("subject_key", "=", sample.key).forUpdate().executeTakeFirst();
  if (old && at < old.last_sample_at) throw new Error("history_clock_rollback");
  const scope = historyScope(sample), sameScope = !!old && old.epoch === epoch &&
    JSON.stringify(historyScope(old)) === JSON.stringify(scope);
  const expired = !!old && old.last_sample_at < retentionCutoff(at);
  const resumed = !!old && (old.suspended || expired);
  const gap = !!old && !old.suspended && at.getTime() - old.last_sample_at.getTime() > historyContinuityMs;
  let number = old ? Number(old.transition_number) : 0;
  const cursorId = old?.id ?? randomUUID();
  const beforeFacts = old && !expired ? safeHistoryFacts(old.facts) : null;
  const event = async (kind: "state" | "context" | "gap", afterGap: boolean) => {
    if (!old || !Number.isSafeInteger(++number)) throw new Error("history_sequence_exhausted");
    await trx.insertInto("history_events").values({ id: randomUUID(), cursor_id: cursorId,
      transition_number: number, epoch, host_id: sample.host_id, subject_key: sample.key, ...scope,
      kind, from_state: old.state, to_state: sample.suspend ? old.state : sample.state,
      from_reason: old.reason, to_reason: sample.reason, previous_sample_at: old.last_sample_at,
      observed_at: at, measured_at: sample.facts.measured_at ?? sample.facts.contact_at ?? null,
      after_gap: afterGap, previous_scope: sameScope ? null : historyScope(old),
      before_facts: beforeFacts, after_facts: sample.suspend ? null : facts }).execute();
  };
  let since: Date | null = sample.suspend ? null : at;
  let firstSeen = at;
  if (old) {
    if (!sameScope) await event("context", resumed || gap);
    else if (sample.suspend) {
      if (!old.suspended) await event("gap", true);
      firstSeen = old.first_seen_at;
    } else if (resumed) await event("context", true);
    else {
      firstSeen = old.first_seen_at;
      if (gap) await event("gap", true);
      if (old.state !== sample.state) await event("state", gap);
      else if (!gap) since = old.continuous_since;
    }
  }
  const values = { epoch, ...scope, state: sample.suspend && sameScope ? old!.state : sample.state,
    reason: sample.suspend && sameScope ? old!.reason : sample.reason, first_seen_at: firstSeen,
    continuous_since: since, last_sample_at: at, measured_at: sample.suspend ? null
      : sample.facts.measured_at ?? sample.facts.contact_at ?? null,
    facts: sample.suspend ? null : facts, suspended: sample.suspend, transition_number: number };
  if (old) await trx.updateTable("history_subjects").set(values).where("id", "=", old.id).execute();
  else await trx.insertInto("history_subjects").values({ id: cursorId, host_id: sample.host_id, subject_key: sample.key, ...values }).execute();
  return { events: number - Number(old?.transition_number ?? 0), cursorId };
}
export function matchesHistoryScope(cursor: Selectable<HistorySubjects>, sample: HistorySample) {
  return cursor.host_id === sample.host_id && cursor.subject_key === sample.key && cursor.state === sample.state &&
    !cursor.suspended && JSON.stringify(historyScope(cursor)) === JSON.stringify(historyScope(sample));
}
