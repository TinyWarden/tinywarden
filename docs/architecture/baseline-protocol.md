# Baseline integration v1

P4 [data lifecycle](data-lifecycle.md) defines detail expiration, retained retry
identity and expired-current-evidence behavior; implemented locally; live activation is pending.

P3.C exact interfaces, selected within the approved P3.1 invariants. This document
owns wire/digest, additive schema and private lane state. [Baseline observations](baseline-observations.md)
owns authority, compatibility, scheduling and current-health invariants;
[normalizers](baseline-normalizers.md) owns the typed evidence and evaluator.

## Definitions, policy and audit

Known keys are `package-updates`, `reboot-required`, `fstrim-status` (response/UI
order). SQL definition locks always use sorted key order, before host, agent,
credential and host policy. Each global revision stores its complete fixed recipe,
normalizer/evaluator, `interval_seconds` 300..86400, `timeout_seconds` 1..30 and
`package_mode` (`upgrade`, or `with-new-pkgs` only for package-updates). Initial
interval is 3600, budgets 30/10/10, package mode upgrade.

Operator GET/POST `/api/v1/operator/baseline-definitions/<key>` reads/edits one
default. POST fields are exactly `schema_version=1`, `request_id` (UUID v4),
`expected_revision` (safe integer >=1), `interval_seconds`, `timeout_seconds`,
`package_mode`. No arbitrary recipe/argv input is accepted.
GET/POST `/api/v1/operator/hosts/<id>/baselines/<key>` reads/edits policy; POST
is exactly schema/request ID, `expected_policy_version` (>=0),
`expected_default_revision` (>=1), `mode` (`inherit` or `override`), plus the three
values only for override. Overrides pin the complete source revision; same-value
saves preserve pins. Receipt replays use the same root/key/host/preconditions and
values. Session authority is rechecked after domain locks; changes, typed audit
and receipts commit together. No-change saves still retain an idempotency receipt.
Reads return saved/default/effective values and last delivery separately.

Migration 006 adds baseline definition/revision, policy/revision, snapshot and
mutation-receipt tables; 007 adds scoped runs and recovery latches. All keys,
generation/revision/sequence relationships and uniqueness use typed columns/FKs.
Bounded validated recipes/observations use JSONB. Audit stays owned by the existing
typed access boundary: additive baseline columns and `baseline.*` actions preserve
the original disk audit columns/constraints. Initial three defaults have system
initialization audit events. Down migration requires forward repair of retained
history. No existing 001–005 file or disk row format changes.

## Assignment endpoint and cache

POST `/api/v1/agent/baseline-assignments`: exact fields `schema_version=1`,
`agent_version`, bounded unique `capabilities` strings and `known_assignments`.
The latter has exactly three ordered `{definition_key,known}` records; known is
null or exactly `{id,revision,digest}` (UUID v4, safe positive integer, lowercase
64-character SHA-256). Authenticate before using any known hint.

Response is exactly schema, `host_id`, `agent_id`, `generation`,
`poll_interval_seconds=60`, `assignments` (exactly three known keys in order).
Each is exactly `definition_key`, `assignment_id`, `revision`, `digest`,
`not_modified`, and `assignment` only when not_modified is false. Assignment is
exactly `definition_revision`, `policy_version`, `mode`, `applicability`,
`normalizer`, `evaluator`, `interval_seconds`, `timeout_seconds`,
`stale_after_seconds=3*interval`, `recipe` (the strict runner shape).
Applicability is ready/unsupported_os/unsupported_architecture/missing_capability.
Unsupported assignment still preserves its fixed recipe; it cannot be launched.

Canonical assignment digest is SHA-256 of compact UTF-8 JSON array:
`[1,host,agent,generation,key,assignment_id,revision,definition_revision,policy_version,mode,applicability,capability,normalizer,evaluator,interval,timeout,stale,recipe_tuple]`.
Recipe tuple is `[schema_version,capability,policy_version,timeout_seconds,steps]`;
steps are ordered `[id,profile,argv]` arrays. All strings in this tuple are ASCII;
integers are safe 0..9007199254740991. No whitespace or trailing LF. Shared
authored fixtures pin the exact bytes and both language consumers.

Missing retained current-generation known snapshot or equal-revision identity
conflict commits a generation-wide baseline recovery latch before HTTP 409.
It persists even when a later request has no known cache. Current health and lease
renewal remain blocked until explicit credential replacement and fresh delivery.
Unknown run snapshot also commits this latch after authentication. Wrong scoped
retained snapshots reject without affecting another host's authority.

Local `baseline-assignments.json` is schema 1, scoped by origin/host/agent/generation,
with all three complete entries, UTC `validated_at` and durable `paused` flag.
Local scope is exactly `{version:1,origin,host_id,agent_id,generation}` under
`scope`. Cache fields are exactly `scope,entries,validated_at,paused`; each entry
is the full delivery (`not_modified:false` and complete `assignment`). Sequence
fields are `scope,last,active` (active is nullable). Queue fields are
`scope,dropped_runs,in_flight_id,pending`; each pending entry is
`{id,sequence,digest,body}`, with body a string preserving exact UTF-8 request
bytes and digest SHA-256 of those bytes. Active is exactly
`{id,sequence,entry,started_at,dropped_runs}`. Scope mismatch archives old state
before creating empty work; corruption never takes that path.
`baseline-pause.json` is exactly `{scope,paused:true}` and retains terminal/backward
clock pause even before the first complete cache. Restart does not clear it;
explicit new credential generation archives the former scope's marker.
Validate complete profiles, versions, digest, monotone per-key revisions and exact
identity on equal revisions. Renew one captured validation time only after all
three entries validate. Lease expires at 24 hours, pauses on backwards wall time
or terminal fault and caps each execution context. Invalid/newer local state is
preserved and pauses this lane; never reset it automatically.
On restart the saved `validated_at` seeds the last known wall-time boundary.
A clock earlier than that boundary triggers the durable pause before any fetch
response can renew the cache or a recipe can be allocated.

## Run endpoint, sequence and queue

POST `/api/v1/agent/baseline-runs`: exact schema, `run_id`, `run_sequence`,
`assignment_id`, `started_at`, `finished_at`, `dropped_runs`, `observation`.
IDs are UUID v4, sequence 1..safe-max, dropped 0..safe-max, times exact UTC
`YYYY-MM-DDTHH:mm:ss.sssZ` with start <=finish. Observation is the complete
strict P3.B shape; key/normalizer/package mode must match its retained snapshot.
Fstrim observed_at must equal the finishing UTC second. Reply is exactly schema,
run ID/sequence, original first `received_at`, `duplicate`. Unknown/wrong-scoped
snapshots never use current settings. Agent status/upload never renews heartbeat.

Run digest array: `[1,run_id,sequence,assignment_id,start,finish,dropped,observation_tuple]`.
Observation tuple: `[schema,key,normalizer,problem,execution,packages,reboot,fstrim]`.
Execution entries: `[step_id,profile,outcome,exit_code,signal,stdout_truncated,stderr_truncated,cleanup_complete]`.
Packages: `[mode,upgraded,installed,removed,held_back,index_freshness,state_consistency]`
or null; reboot `[marker_observed,assurance]` or null. Fstrim is
`[timer,service,observed_at,reclamation_verified]` or null. Timer tuple is
`[load_state,active_state,unit_file_state,last_trigger,next_elapse,condition]`;
service `[load_state,active_state,result,exit_kind,exit_status,started_at,finished_at,condition]`;
condition `[passed,checked_at]`. Preserve null and booleans, ordered arrays and
safe integers. Server evaluates only with the snapshot's original evaluator.

`baseline-sequence.json` persists origin/host/agent/generation, last allocated
sequence and an optional active run with its immutable assignment/start/identity
before launch. Restart represents an interrupted active run as execution_missing,
unless already durably queued. Never reuse its sequence. `baseline-queue.json`
contains scoped hashed exact request bytes, dropped count and one in-flight ID.
Cap 100 runs/1 MiB total; preserve uncertain in-flight bytes and discard oldest
other completed runs with a bounded drop count. Persist queue before clearing the
active identity. A missing/corrupt same-generation sequence or queue pauses work.
Replacement may archive abandoned old-generation work without replaying it under
new authority. Files use mode 0600, no-follow checks and atomic fsync/rename under
the existing private state lock. No raw process output is persisted.

## Health, limits and compatibility

Operator GET `/api/v1/operator/hosts/<id>/baselines` returns all three current
summaries plus five recent immutable runs per key. Require operator authority;
Each check includes nullable `valid_until`, the earliest contact/evidence expiry
for a current healthy/warning assessment. The browser deducts request duration
and elapsed monotonic time; an expired or failed refresh displays outdated/
unknown current status while retaining historical attention.
current state additionally needs current contact/generation, no recovery latch,
current source/policy and fresh latest-sequence evidence. Freshness anchor is min
(finished, first receipt); future skew >30 seconds, backwards server time and age
>=three intervals remain unknown/stale. Newer unknown runs supersede old healthy
ones. Known attention stays visible with incomplete assurance. Historical results
retain their original snapshot/evaluator; current settings do not reinterpret them.

Requests: assignments 16 KiB, runs 32 KiB; response/cache 48 KiB; recipe 8 KiB.
Reject unknown/duplicate fields, incompatible versions, duplicate key/step/ID,
bad encoding and excessive nesting before use. The baseline transport extends
only its own response bound; P1/P2 limits retain their existing values.
One asynchronous baseline fetch, one fair rotating recipe worker and one upload
are independent of heartbeat/disk; no catch-up queue. Check runner availability
before allocating new work when cleanup holds its slot. Terminal assignment
fault cancels active execution and durably pauses cache; 401 cancels all lanes.
Old endpoint 404 pauses baseline only; P1/P2 keep working. Capability advertisement
begins only with the complete connected worker, and local OS/architecture is
rechecked before every launch. Live upgrades remain separately authorized.
