# Data lifecycle and storage

Use [backup and recovery](../operating/backups-and-recovery.md) for procedures.
This reference distinguishes durable authority, immutable evidence and bounded
retained detail. Deleting a reading is not equivalent to resetting its identity.

## Data families

| Family | Meaning and lifetime |
| --- | --- |
| Hosts, agents, credential generations and access grants | Authority and scope; revocation is explicit, not an observation-retention side effect |
| Package content and admitted metadata | Immutable digest-addressed identity, including release README/license and catalogues |
| Installations, defaults and per-host policies | Selected digest, enablement and revisioned configuration |
| Assignments | Immutable resolved execution context and bounded lease |
| Run receipts | Exact request identity/fingerprint and original acceptance; survive detail pruning |
| Observations, timed assessments and reducer state | Evidence and interpretation tied to the original context/digest; retained detail is bounded |
| Resource inventories and memberships | Discovery snapshots and independently versioned selection epochs |
| History subjects/events | Sampled state cursors and changes, not a record of every machine action |
| Notification cursors/outbox/attempts | Transition exposure, immutable message evidence and delivery disposition |
| Operator sessions and account-email tickets/jobs | Short-lived authentication/recovery authority, with separate expiry/cleanup |

Exact table definitions and constraints live in
[server/db/migrations](../../server/db/migrations) and the
[database types](../../server/db/types.ts). Do not bypass these domain rules with
ad hoc SQL in an API or UI component.

## Time and ordering

Keep collection time, receipt time, contact time and evaluation time distinct.
Host timestamps cannot establish current authority. Accepted late observations
retain their original context and do not replace newer state. A receipt replay
returns the original receipt and cannot append duplicate metric/history detail;
its successful contact check can still update separate contact evidence.

Effective settings/digest/policy changes require evidence for the new context.
Stored older results remain historical instead of being interpreted under today's
settings. Reducer state may be absent or reset; skills must tolerate that. Resource
membership epochs prevent removing/re-adding a key from inheriting a prior incident
or recovery entitlement.

## Retention and capacity

Observation/history/metric detail defaults to 90 days, configurable by Admins in
Settings → Data from 1–3650 whole days. A shared irreversible expiry watermark
prevents an increase from resurrecting previously expired detail. Read paths enforce the
boundary even if the cleanup timer has not yet removed rows. Package details use
original server receipt age; evidence can become stale much sooner (normally three
configured intervals). Contact or authority changes may invalidate current use
before either limit.

Retention runs in bounded batches with transaction/statement/lock budgets. It
prunes observation children, old reducer state, event facts/message snapshots,
inventory detail and unused retired memberships while preserving necessary replay
and authority records. An expired row is not a reason to accept the same sequence
again. Legacy and package reducers serialize their commit with the retention
policy before taking collection/host locks. Derived context cannot import expired
execution detail from a more recent intermediate row. Manual/repository/account-email
cleanup has its own domain rules.

Per-agent admission budgets limit database growth before retention. The default
accounting budget is 2 GiB, estimated conservatively from stored allocations; it is
not a measurement of PostgreSQL or filesystem bytes. Budget rejection rolls back
new allocation instead of evicting current history to make a request succeed.
Heartbeat, unchanged polls and valid exact receipts remain usable. Replacing
credentials does not erase accumulated budget. Diagnose/size capacity and review
an explicit budget change rather than resetting identity to evade the boundary.

Metric queries additionally cap frames, buckets, series, execution time and response
size; see [metric history](skills/metric-history.md). These bounded APIs are not a
bulk database export interface.

## Migrations and restore

Migrations use an ordered ledger and exact target/ownership checks. Write forward
migrations and preserve old evidence meaning; changing a schema version alone does
not migrate immutable assignments or published packages. Run migrations against
the intended owned database once under the native release lock.

A restore can resurrect authority, reset counters or replay outbound messages.
Pause services/jobs, reconcile revocations and generations, discard/reconcile
restored sessions/tickets/outbound work, start a new history baseline and rotate
notification state with transport disabled. Reestablish fresh agent evidence before
trusting current health. Follow the full [recovery guide](../operating/backups-and-recovery.md);
restoring SQL and starting the web process is insufficient.

## Source

[Maintenance retention](../../server/maintenance/retention.ts),
[package retention](../../server/skills/results/package-retention.ts),
[resource retention](../../server/skills/resources/retention.ts),
[history retention](../../server/history/retention.ts),
[notification retention](../../server/notifications/retention.ts) and
[migration ledger](../../server/db/ledger.ts) contain the owning operations.

## Fleet identity and deletion

Pause stops collection without deleting identity; maintenance keeps collection and
suppresses alerts; archive revokes credentials while retaining the same data bucket.
An explicit restore code preserves that ID and rotates its credential generation.
Permanent removal fences the identity, then a bounded resumable worker purges owned
data and verifies accounting before deleting roots. Shared records stay intact.
See [Fleet management](fleet-management.md) for the complete lifecycle, dependency
coverage, replay, retention and recovery rules.


## Maintenance evidence

The maintenance owner contains jobs, immutable plans/approvals/events, upload
parts, verification Check now links and scoped recovery authorizations/receipts.
Terminal resolved details follow the configured retention; active, attention,
running and pending-recovery work retain their evidence and linked manual runs.
Host purge removes all seven families through the existing stable stage numbers.
Shared bulk approvals survive only while another target references them. A restored
approval is not permission to replay a host transaction: reconcile durable root
journals and current authority before resuming. See
[maintenance contracts](maintenance-actions.md) and [recovery](../operating/backups-and-recovery.md).
