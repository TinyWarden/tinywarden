# Observed fleet change history

History records sampled state transitions and capture gaps. It is not an audit of
every host action or a replay of every uploaded reading. Protected reads and the
independent native sampler share current assessments while preserving their own
cursor/continuity state.

## Owner and capture

`server/history` serves as the sole transition/cursor owner. An independent
guarded local oneshot job samples the existing contact and check projections.
It runs without an enabled email route and never uses SMTP outbox records as UI
history. No browser-read side effect, receipt hook, broker or second web deployment.
Capture is necessary because contact/readings can become stale without new uploads.

Use the existing private database configuration/login and exact expected-database,
role/schema-owner and migration-ledger guards. No operator session is fabricated.
A dedicated checked-out connection holds advisory lock `(1415007823,5)` for the
whole invocation; failure/loss aborts work and overlapping invocation exits busy.
No network/host execution or email is performed by this job.

Scan at most 50 hosts per invocation in stable UUID order, resuming a durable
round-robin cursor. Stop starting work after 20 seconds of monotonic elapsed time;
bound each transaction to 5 seconds with 250 ms lock wait. Commit progress only
for finished work; replaying a partly completed host is idempotent. Contact, disk
and baseline families use separate transactions, following existing definition
locks → host → agent → credential → history cursor order; never hold both disk
and baseline definition locks together. Capture UTC time after authority locks.
No fleet-wide simultaneous observation is claimed.

The native timer schedules the next invocation 60 seconds after completion, with
no catch-up/replay queue. Capacity is bounded, not a promise to sample every host
every minute. Store scan start/completion and per-subject last-sample times so the
UI can disclose lag/incomplete coverage. Timeout rolls back only that transaction
and ends the invocation safely; committed transitions survive. A future invocation
can retry. Reject older samples on clock rollback; never overwrite newer cursors.

## Storage and event meaning

Add history-owned tables in migration 010:

- Control: current capture epoch, activation time, fair scan cursor and scan health.
- Subject cursor: one row per host and contact/check key; exact agent/generation,
  desired source/policy and assessment-version scope, last state/reason, bounded
  facts, first observation, continuous state start, last sample and transition number.
- Immutable event: epoch, host/subject/scope, unique cursor transition number,
  kind, from/to state, previous sample time, observed time and bounded before/after
  facts. Index the actual newest-first `(observed_at,id)` history query and expiry.

Typed columns constrain identity, scope, enum states, ordering and uniqueness.
Facts use a strict validated shape capped at 8 KiB per side: contact timing or
limited check facts such as the relevant disk mount/usage, package counts, marker
presence or trim outcome. No raw observations, command output, mail bodies or
credentials. Store provenance IDs without requiring purgeable run rows to remain;
history rendering must not depend on joining deleted observations. Enforce host
scope and transactional cursor/event consistency.

Cursor update and event insertion commit atomically. Duplicate invocation/retry
cannot create duplicate transitions. Refresh fact snapshots even when the state is
unchanged, so a later transition compares the most recently observed values.
Changing usage within the same state produces no event. Neither a new reading ID
nor a new heartbeat alone counts as a change.

| Situation | Durable meaning |
| --- | --- |
| First observation after activation | Establish a baseline and first-observed time; no invented prior state or ordinary change event. |
| Same scope, different state | Record observed transition, including check-specific unknown/stale and contact offline/current. |
| Same state, different reason/facts | Refresh cursor facts; no ordinary state-change event. |
| Generation, desired source/policy or assessment version changes | Record a context boundary and seed a new baseline; do not label a policy/interpretation change as repair. |
| Contact becomes unavailable | Record contact transition; suspend check comparisons without four manufactured check failures. |
| Contact returns | Record contact transition; seed eligible check baselines across the interruption. Do not invent intermediate repairs. |
| More than 180 seconds between successful samples | Record an observation gap; comparison continuity ends. Record a changed endpoint as observed after a gap, without claiming its transition time. |

Full history can show context/gap records separately from state changes. Coalesce
one gap per interrupted subject episode; avoid a new gap for every missed minute.
An explicit suspended cursor preserves the boundary until eligible sampling resumes.
No backfill from old runs or reconstruction of transitions missed while stopped.
The dashboard's since-midnight count/panel uses observed state changes, including
changed endpoints after gaps with that qualification, not baseline/context records.

`observed_at` is the server capture time. Preserve the prior sample and source
measurement times separately. It is not the moment a disk crossed a threshold or
a host physically failed. Card durations say first observed and require matching
continuous cursor scope and a sample no more than 180 seconds old; event details
explain gaps. Aggregate Healthy requires every subject to satisfy that bound. No fabricated since-time for
a newly discovered problem. Context resets do not reset the email recovery scope;
that different purpose remains governed by [notifications](notifications.md).

## Protected UI, midnight and retention

Read history through the existing operator/session guard with its fresh completion
recheck. Strictly bound/validate optional host and keyset cursor inputs; apply scope
inside queries. Use at most 25 events by default, maximum 50, newest observed time
then unique ID. Stable keyset navigation must not duplicate equal-time events.
No unrestricted export, search engine or arbitrary query facility is introduced.

Persist UTC instants. Since midnight means the interval from local midnight in
`Europe/Bucharest` through the response's captured current time, including the
lower boundary. Use that named timezone, not a fixed offset or rolling 24 hours;
daylight-saving days can have 23 or 25 hours. Response carries the computed day
boundary/next midnight; the browser refreshes on rollover and visible return.
Use the same zone for displayed calendar times and state the timezone where needed.

Show the panel when retained state changes exist in that interval; otherwise use
the approved full-width design. Failed history reads or lagging capture must show
an unavailable/coverage notice, not a claim that nothing happened. This feedback
does not create a fake change panel or block current fleet health. Full history
discloses when capture began and that it contains sampled, retained changes only.

Use the existing 90-day retention policy for history events, based on observed
time. Filter expired events at read time, regardless of physical cleanup. Extend
the existing cleanup job with a fair history lane, retaining its total 100-row
batch, ten-batch and 30-second invocation bounds; do not add another cleanup timer.
Expire dormant cursor facts/continuity after 90 days while retaining minimal
identity/deduplication metadata. Cursor expiry and capture must lock in a consistent
order; cleanup takes no domain-family locks for the history lane. No backreference
may keep raw observations past their existing retention. Backup retention is installation-specific; no separate permanent history export
is created.

## Release and recovery

Package the job in the same main checkout under the
[native release contract](../deploy/native-release.md#job-bundle-isolation).
Building the job does not enable its timer. Schema 010 and updated web, cleanup, notification and history artifacts
must be compatible before timers resume. Existing exact-ledger maintenance checks
must be updated; do not assume the old 001–009 job accepts an extra migration.

The existing database dump covers history tables and assessment metadata. After a
database restore, reset the capture epoch and seed fresh cursors alongside existing
notification recovery handling. Retained events remain historical; restored cursors
cannot assert continuity through downtime. Do not undo additive schema or change
old assessment versions during code recovery. Keep a schema-compatible artifact
available; restoration is a separately authorized recovery action.

## History browsing

Multi-select host IDs (maximum 50) and existing subject keys (maximum 5) filter
inside the authorized retained-history query. Event type maps to existing state,
gap and context kinds; Baselines is the presentation of context boundaries.
Empty selections mean all. Keep the existing single-host link query compatible.
A canonical filter digest binds keyset cursors to selections and kind, independent
of their ordering. No cursor can silently cross filters. Default 25/max50 event
page limits, transaction timeouts and final authorization recheck remain.

Option counts cover the full retained 90-day window, independent of selections;
result counts cover all matching records before pagination. Server choices are
bounded to 100, selected first, then with events, then by label/ID. Search applies
to the database inventory, with a total match count and narrowing notice when
more than 100 match. Search is literal case-insensitive text, not SQL patterns.
Only the four implemented checks plus server contact appear in Skills. No new
skill runtime or marketplace is introduced.

New first-page results invalidate older loaded pages when their page identity
changes; unchanged first pages preserve older navigation. Filters cancel obsolete
reads by remounting their read owner; dropdown state remains outside that owner.
Permission loss clears retained read metadata and choices. Reference day groups
use Europe/Bucharest, including daylight saving. Before/after tables use only
stored facts and provenance. Capture gaps do not assert physical downtime or its
cause; context records do not invent agent versions. Existing dashboard history
presentation and capture/writer semantics are unchanged. No schema migration.
