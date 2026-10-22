/** Cross-machine allowance at transport admission, never an execution budget. */
export const skillClockToleranceMs = 5000;

export function skillEvidenceTime(capturedAt: number, receivedAt: number) {
  return Math.min(capturedAt, receivedAt);
}

/** Reuse the admission bound on reads; app time may never precede its own receipt. */
export function validSkillEvidenceClock(capturedAt: number, receivedAt: number, at: number) {
  return receivedAt <= at && capturedAt <= receivedAt + skillClockToleranceMs;
}

/** Accepted captures may lead receipt slightly. Skills see a coherent instant;
 * expiry uses the earlier clock so that allowance never grants extra freshness.
 * Original capture/receipt timestamps remain available for evidence and audit.
 */
export function skillEvaluationClock(capturedAt: number, receivedAt: number, intervalSeconds: number) {
  return {
    now: Math.max(capturedAt, receivedAt),
    expires: skillEvidenceTime(capturedAt, receivedAt) + intervalSeconds * 3000,
  };
}

/** The initial assessment applies on receipt. Later absolute transitions stay put. */
export function receiptTimeline<T extends { from: number }>(entries: T[], receivedAt: number): T[] {
  return entries.map((entry, index) => index === 0 ? { ...entry, from: receivedAt } : entry);
}
