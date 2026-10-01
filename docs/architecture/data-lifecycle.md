# Observation retention and recovery

Status: P4.1 contract decided 2026-09-30; P4.2/P4.3 implemented and verified locally
on 2026-09-30. Live migration and approved cleanup scheduling were activated
2026-10-01; the first bounded cleanup completed with no expired rows.
This document owns retention eligibility, cleanup, retry preservation and recovery
acceptance. Existing [disk](disk-observations.md), [baseline](baseline-protocol.md)
and [access](../security/access.md) contracts continue to own ingestion and authority.

## Policy and data classes

Detailed observations are retained for **90 elapsed days from first server receipt**.
Capture one injected UTC instant per cleanup invocation or authenticated read; cutoff
is that instant minus 90 × 86,400 seconds. Reads return that declared `as_of` and
retain the existing fresh authorization recheck after waits; fixing the retention
clock must not extend a session. A row is expired only when
`received_at < cutoff`; equality is retained. Agent timestamps and retry arrival
never extend retention. A delayed first upload receives the normal retention window;
existing freshness rules still prevent old measurements becoming fresh health.

| Data | Treatment |
| --- | --- |
| Disk runs and their mount measurements; baseline runs and typed observations | Hide expired detail from application reads; physically remove it through bounded cleanup. No separate history exports. |
| Compact receipts for removed runs | Keep identity, scope, original receipt time and request digest for retries and ordering. No measurements, mount paths, execution output, classifications or observation bodies. |
| Definition/policy revisions, assignment snapshots, hosts, agent generations, enrollment/credential history and recovery latches | Retain under their existing authority/reference contracts. Cleanup does not remove them. |
| Audit events | Remain append-only through application boundaries; no age-based audit purge. |
| Operator sessions | Existing bounded invalid/expired-session maintenance remains separate. |
| Backups | Outside the online observation window. PBS retains its own backup history; no assumed retention duration or individual-reading retrieval guarantee. |

Expiration is not immediate byte erasure: physical rows wait for the next successful
cleanup, and database storage/backups can retain older bytes. Receipts and authority
history continue growing; this policy bounds detailed observations, not total
metadata storage. A future receipt/identity purge requires a new protocol decision.

## Receipt representation and ingestion

Add `disk_run_receipts` and `baseline_run_receipts` for **removed runs only**. Each
stores `id`, `host_id`, `agent_id`, `generation`, `run_sequence`, `assignment_id`,
`received_at`, `request_digest`; baseline also stores `definition_key`. Preserve
existing UUID, safe-integer, digest-length and composite scope constraints. Use
primary key `id`, unique `(agent_id,generation,run_sequence)` within each family,
and restricted foreign keys to the same host/credential/snapshot identities as runs.
A baseline sequence remains shared across baseline definitions; do not scope its
uniqueness by definition key. Disk and baseline remain separate namespaces.

A run identity exists in exactly one of the full-run or receipt tables after commit.
Root transactions enforce uniqueness across both tables under the family locks;
per-table database constraints remain the final local backstop. An unexpected
cross-table overlap or mismatched receipt aborts cleanup; never ignore the conflict.
There is no up-front copy of all observations or rewrite of historical migrations.

Ingestion continues to validate the complete request and current credential/snapshot
before checking both full runs and receipts by run ID and generation/sequence.
An exact authorized retry returns the original `received_at` with `duplicate:true`.
An ID/sequence/scope/digest mismatch returns the existing `run_conflict`. A receipt
never recreates a full run, renews contact or clears a recovery latch. Revoked or
replaced credentials remain rejected. Wire schemas, digests and agent state do not
change; no agent binary change is required by this contract.

## Current state and history reads

The observation read boundary applies the same 90-day predicate even while cleanup
is delayed. Filter before the existing recent-history limit. Never return expired
measurements through `latest`, history or another consumer of these reads.

Determine the highest accepted sequence from the union of full runs and receipts,
then resolve its detail if still retained. Preserve existing scope: disk uses the
current assignment; baseline uses agent/generation/definition, checking whether
that highest run belongs to the current assignment. Do not fall back to a lower
sequence because the highest run was purged or expired. In particular, a recently
received out-of-order healthy run cannot replace a higher expired unknown run.

When the highest applicable evidence is expired, expose `latest:null`, state
`unknown`, reason `history_expired`. Existing authority, recovery, contact and
assignment checks retain precedence. No accepted evidence still means
`no_observation`; mismatched baseline assignment still means `assignment_obsolete`.
Receipts never appear as measurements/history entries and never imply health.
Retained results preserve their immutable snapshot interpretation. Add the new
reason through the English catalog and existing health views, including attention
consumers, without creating a new settings interface or changing API field shapes.

## Cleanup ownership, bounds and failure

`PruneExpiredObservations` is a local maintenance root. A thin CLI uses the existing
private database configuration and single `tinywarden` login. Default to dry-run;
mutation requires explicit apply mode and an exact expected database name. Before
work, verify configured/connected name, session/current role, database/schema owner
and required migration ledger using the existing migration guard pattern. Reject
ambiguous targets. Do not add a web/agent endpoint, new role, cluster or service
identity. The 90-day value has one policy owner; no arbitrary cutoff override.

Process at most 100 parent runs per transaction, at most ten nonempty batches per
invocation, alternating disk and baseline so neither starves. Stop starting batches
after 30 seconds of monotonic elapsed time. Each transaction has a five-second
transaction/statement limit and 250 ms lock limit. Timeout/lock failure rolls back
that batch and ends the invocation with a safe retryable result; completed batches
remain committed. Do not loop automatically on errors. Explicit rerun is safe.

For each batch:

1. Open the transaction and take the existing family's definition locks exclusively:
   disk definition first, or all baseline definition heads in their existing sorted
   order. Do not hold disk and baseline locks in the same transaction. Existing
   ingestion and health reads hold these heads shared; this prevents a read or
   retry observing a half-completed transfer. Cleanup acquires no earlier
   operator/session lock; normal foreign-key checks protect retained dependencies.
2. Select and lock up to 100 expired parents ordered by `(received_at,id)`, rechecking
   eligibility using the invocation's fixed cutoff. Add indexes matching this actual
   selection and the receipt ordering/scope lookups; retain referencing-FK indexes.
3. Insert matching compact receipts; delete disk children before their parents, or
   delete baseline parents. Reconcile selected, receipt and deleted parent counts
   and actual deleted mount count; any mismatch aborts the entire batch.
4. Append one typed audit event in the same transaction, then commit. An empty batch
   has no mutation or audit event. If audit fails, all receipt/deletion work rolls back.

Use action `observation.retention_pruned`, actor `system`, with normal event ID/time
and correlation plus allowlisted family (`disk`/`baseline`), cutoff, retention days,
parent count and mount count (zero for baseline). Other actor/target/change fields
are null. Enforce numeric bounds and action-specific combinations in the audit
helper and schema. Do not log deleted IDs, digests, measurements or credentials.
Return aggregate committed counts, cutoff and whether more eligible work remains;
report bounds honestly rather than doing an unbounded count. Dry-run uses bounded
read-only selection with no audit, mutation, exact-total claim or receipt export.

No backup is created on each cleanup. Scheduling belongs to P4.C native packaging:
prepare an opt-in hourly user timer, UTC, one catch-up invocation after downtime,
using the same CLI/budgets. Failure is visible in exit status/journal; no internal
retry storm or external notification. Disabling the timer pauses physical cleanup;
read filtering continues. Installation/enablement and the first production apply
require deployment authority; P4.A implements and verifies the local entry point.

The locking and timeout choices follow PostgreSQL 18's
[row-lock semantics](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS)
and [connection timeout controls](https://www.postgresql.org/docs/18/runtime-config-client.html).

## Migration and rollback

Use a new additive migration for receipt tables, indexes and typed audit fields.
Keep original observations and audit rows untouched during migration. Verify clean
install, populated upgrade and repeated migrator behavior on the existing test
instance. Cleanup stays disabled until compatible ingestion and reads are installed.

Before any purge, a tested older application may use the additive schema while
cleanup is disabled, subject to the release's normal compatibility proof. **After
the first purge, pre-retention code is not an eligible rollback:** it does not consult
receipts and can accept old uploads as new evidence. Preserve the schema and use a
retention-aware compatible release or forward repair. No destructive down migration.
Database restore is a separate authorized recovery operation, never automatic.

Reuse the [scoped release matrix](../deploy/native.md#select-only-the-changed-release-steps).
This new recovery/state contract needs one populated P4.A cleanup/restore rehearsal.
Reuse that evidence for an unchanged deployment; do not repeat it merely to deploy.
Capture the normal restricted readable pre-change dump for the first live upgrade.
Later routine cleanup needs no per-run archive or full restore rehearsal.

## Recovery contract and focused acceptance

P4.3 uses synthetic populated fixtures in the reserved test database, with a fresh
uniquely named `tinywarden_test_p4a_restore_*` database on the same PostgreSQL instance
for restore. Use the existing login and target ownership guards. Reject the serving
database, pre-existing targets and unknown schema. Restrict PUBLIC connection access,
retain archive ACLs, and verify database/schema/table permissions. The harness owns
and removes only its generated disposable database and synthetic backup artifacts.
No second serving checkout, production dump restore or test agent connection.

Exercise one representative lifecycle: populate retained/expired evidence and
identity history; apply migration; clean up; make a restricted custom-format dump;
restore to the disposable target; reconcile the source snapshot and verify through
real application boundaries. A database dump excludes external configuration and
agent state; those remain separate restricted recovery inputs, as documented in
[operations](../operations/runbook.md#backup-restore-and-failure-recovery) and
[PostgreSQL's dump documentation](https://www.postgresql.org/docs/18/app-pgdump.html).

| Proof | Required result |
| --- | --- |
| Cutoff and deletion | Equality retained; one millisecond older expires; both families, mount dependencies and late first uploads behave as specified. One UTC duration across DST/calendar boundaries; one captured cutoff per invocation. |
| Retry and concurrency | Exact/changed retry before/after purge and concurrently with cleanup; run-ID and sequence collisions across scopes and baseline keys; two cleaners; timeout/audit failure. Original receipt preserved, no resurrection/partial deletion, bounded work and safe rerun. |
| Read semantics | Expired latest hidden before and after physical purge; higher expired sequence blocks lower recent evidence; retained history/source interpretation unchanged; source/recovery/contact precedence and localized unknown state pass. |
| Migration and restoration | Original fixture rows preserved by migration; full+receipt identities partition accepted runs; restored detailed/receipt/child/audit counts and affected FKs match the dump snapshot; ledger and ACLs match. No unexplained loss. |
| Credentials and recovery | Synthetic operator login and current credential work; revoked/replaced credential fails; heartbeat duplicate/order rules, assignment-loss/regression latches and receipt replay survive restore. Preserve agent sequence/state in recovery; never reset to fit the server. |
| Cost and isolation | Only disposable existing-instance targets receive synthetic writes; bounded CLI failure/output; no external sends, real-host commands, full phase/security gate or production maintenance during P4.A. |

For an actual recovery, keep ingress/cleanup paused until the chosen database,
compatible code, private configuration and agent identities are reconciled. A backup
can predate password changes, revocations or replacement generations: invalidate
restored operator sessions and reconcile newer authority changes from trusted
recovery evidence before serving. If evidence is unavailable, require an explicitly
authorized operator reset/credential replacement for the uncertain scope; do not
silently revive old authority. Preserve current agent state and accept higher
sequences normally where the snapshot contract permits; missing/regressed snapshots
must retain existing recovery behavior.

A restore only recovers the chosen backup point. Report the gap and any newer lost
observations/settings; already acknowledged agent results are not guaranteed to
replay. Verify fresh post-recovery contact and representative results before accepting
live recovery. PBS backup coverage and recovery time are not guaranteed by this test.
Local deployment recovery files stay restricted and are retired only when a newer
verified compatible recovery point supersedes their rollback need; P4.A does not
prune existing backups or change PBS policy.

## Local implementation and operation

Migration `008_observation_retention` implements the additive representation. The
owning modules are `server/checks/retention.ts`, `retention-policy.ts` and
`run-receipts.ts` under `apps/web`; `server/db/target.ts` shares the migration guard.
The existing disk/baseline ingestion and health boundaries consult receipts and
apply retention. English catalog entries explain expired history. No wire or agent
change is involved.

From `apps/web`, with the existing private configuration available:

```sh
node --env-file=.env.production.local --import tsx scripts/retention.ts --expected-database tinywarden
```

That command is a bounded read-only preview. After authorized deployment and first
cleanup approval, append `--apply` to execute. `npm run retention --` provides the
same CLI when environment variables are already loaded. Output contains only mode,
cutoff, counts, batch count, outcome and `more_eligible`; null means an interrupted
invocation could not establish whether work remains. Dry-run counts describe at
most 100 parents per family, not total backlog. An apply result can be bounded yet
successful; explicit later invocations continue from remaining rows. Retryable or
failed results exit nonzero and preserve already committed batch counts.

Reproduce the local lifecycle and restore proof with the reserved
`TW_TEST_DATABASE_URL` using `npm test -- tests/p4a.retention.test.ts
 tests/p4a.recovery.test.ts` from `apps/web`. These tests guard ownership before
resetting only the reserved synthetic schema. The restore helper honors the URL's
Unix-socket host override, creates one restricted custom dump and removes its own
disposable database/files. P4.C supplies the opt-in timer; none is installed here.
