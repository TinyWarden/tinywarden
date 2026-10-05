# Baseline normalizers and evaluators v1

This contract defines typed local evidence, format/range rules and server
classification. [Baseline observations](baseline-observations.md) owns current
health gates; [recipe execution](recipe-execution.md) owns execution containment.
Agent implementation and authored examples live in
[tinywarden-agent](https://github.com/TinyWarden/tinywarden-agent).

Wire evaluator/normalizer identifiers and version-1 historical meanings remain
unchanged. [Per-run assessment version 2](fleet-dashboard.md#per-run-assessment-compatibility)
allows clean local package/reboot results to pass their limited checks.
[Assessment version 3](#persistent-trim-assessment-version-3) adds retained trim
execution/schedule context. New readings use version 3; old history is unchanged.

## Ownership and recipes

`internal/skills/builtin` constructs fixed recipes and converts transient runner
buffers into typed evidence. It has no credential, health, scheduler or persistence
dependency. `server/skills/legacy/shared/observation.ts` strictly validates that
evidence; `baseline-evaluation.ts` alone classifies it. All visible reasons and
scope limits belong to `messages/en.json` under `baseline`.

| Key | Normalizer | Evaluator | Ordered step IDs/profiles | Default budget |
| --- | --- | --- | --- | --- |
| `package-updates` | `apt-plan.debian13.v1` | `package-plan.v1` | `apt` / `apt-upgrade.v1` | 30 seconds |
| `reboot-required` | `reboot-marker.debian13.v1` | `reboot-marker.v1` | `marker` / `reboot-marker.v1` | 10 seconds |
| `fstrim-status` | `fstrim-systemd.debian13.v1` | `fstrim-systemd.v1` | `timer` / `fstrim-timer.v1`, then `service` / `fstrim-service.v1` | 10 seconds |

Construct schema 1, capability `exec_observe.debian13.v1`, policy 1 recipes with
one whole budget of 1..30 seconds. Both APT modes are admitted: argv
`["--simulate","upgrade"]` or `["--simulate","--with-new-pkgs","upgrade"]`.
Reboot argv is `["-e","/run/reboot-required"]`. Both systemctl arrays begin with
`["--system","--no-pager","--no-ask-password","--all","--timestamp=unix","show"]`,
then exactly the following property option and final unit argument:

- Timer: `--property=Id,LoadState,ActiveState,UnitFileState,LastTriggerUSec,NextElapseUSecRealtime,ConditionResult,ConditionTimestamp`, `fstrim.timer`.
- Service: `--property=Id,LoadState,ActiveState,Result,ExecMainCode,ExecMainStatus,ExecMainStartTimestamp,ExecMainExitTimestamp,ConditionResult,ConditionTimestamp`, `fstrim.service`.

Each normalizer requires this entire matching recipe, including step IDs/order,
and the runner's strict profile validator. Individually admitted extra steps do
not become a valid baseline. Every call creates independent argv/step arrays.
Baseline delivery gates Debian 13/amd64 applicability and advertise capability only after
the complete connected worker exists. Missing/untrusted tools fail under runner
policy; no alternative command, privilege escalation or automatic installation.

## Typed observation shape

JSON object fields are exactly `schema_version`, `key`, `normalizer`, `problem`,
`execution`, `packages`, `reboot`, `fstrim`. Schema is integer 1; key/normalizer
must match the table. `problem=none` requires complete successful execution and
exactly its own non-null payload. Any other problem requires all three payloads
null. Unknown fields, types, versions and combinations are rejected, not coerced.

`execution` contains at most the recipe's steps in matching order. Each entry has
exactly `step_id`, `profile`, `outcome`, `exit_code`, `signal`, `stdout_truncated`,
`stderr_truncated`, `cleanup_complete`. Exit is null or integer 0..255; signal is
null or integer 1..64; both cannot be non-null. Flags are booleans. Outcomes are
`exited`, `policy_rejected`, `spawn_failed`, `timed_out`, `cancelled`, `output_limit`,
`helper_failed`, `cleanup_pending`, `runner_busy`. Payloads require all steps
`exited`, cleanup complete, no signal/truncation and exit 0, except marker exit 1.
Raw stdout/stderr are excluded from observation types and never serialized.

Whole/step failure, missing or mismatched execution, pending cleanup, separate
64 KiB stdout / 16 KiB stderr overflow, signal or unexpected exit remove payloads.
Nonempty stderr, invalid UTF-8, NUL, escape/control characters other than tab/LF,
or unsupported parser output also remove payloads. A complete parser line ends
in LF. No diagnostic, repository URL or package inventory is retained.

## APT and reboot evidence

APT payload fields: `mode` (`upgrade` or `with-new-pkgs`), `upgraded`, `installed`,
`removed`, `held_back` (each integer 0..1,000,000; sum <=1,000,000),
`index_freshness="unverified"`, `state_consistency="unverified"`.
Require exactly one full C-locale legacy line:
`N upgraded, N newly installed, N to remove and N not upgraded.`
Counts have canonical decimal spelling without leading zeroes. `E:`/`W:` lines
or “not fully installed or removed” reject even a following zero summary.
Missing/duplicate summary, optional reinstall/downgrade summary, new `Summary:`
presentation and out-of-range counts are unsupported. Other preamble/plan lines
are discarded. No missing line becomes a zero count.

Removals yield warning `package_removals`; any upgrade/new dependency/held-back
count yields warning `package_changes`. Both remain incomplete because these
commands cannot verify repository freshness or consistent local package state.
All-zero yields informational unknown `package_cache_unverified`, including an
empty cache or changed local-state scenario that prints the same valid summary.
No security update count or fresh-cache assurance is inferred.

Reboot payload is `marker_observed` (boolean) and `assurance="unverified"`.
Exit 0 with empty streams yields true and warning `reboot_marker_present`.
Exit 1 yields false and informational unknown `reboot_assurance_unverified`;
`test -e` cannot distinguish absence from inaccessible traversal. There is no
verified marker-producer input in v1. Unexpected exit/output remains unknown.

## systemd formats, timing and evidence

Read properties by name; require exactly the requested unique names and matching
unit IDs, with each line <=512 bytes. Empty or `@0` timestamps normalize to null.
Accept `@N` with optional 1..6 fractional digits (floor to seconds), or the exact
C-locale `Mon 2006-01-02 15:04:05 UTC` calendar form with matching weekday/date.
Reject relative values, locale/timezone variants and invalid dates. Non-null
timestamps are UTC Unix integer seconds 1..253402300799 (end of year 9999).

The local worker supplies an observation window covering both reads and boot IDs
before/after. Require valid matching lowercase boot UUIDs; never upload those IDs.
Wall time must be ordered and duration <=31 seconds, independently of any Go
monotonic clock. Also reject a monotonic duration >31 seconds. Historical trigger,
start, exit and condition timestamps must precede the window's starting second;
same-second/events during reads are `snapshot_changed`, later-than-finish history
is `clock_uncertain`. Missing/changed boot identity is `boot_uncertain`. Start
after exit or a next scheduled timestamp <=finish is `evidence_inconsistent`.
This catches observable inconsistencies; systemctl's separate reads are not atomic.

Fstrim payload: `timer`, `service`, `observed_at` (window's finishing UTC second),
`reclamation_verified=false`. Timer has `load_state`, `active_state`,
`unit_file_state`, `last_trigger`, `next_elapse`, `condition`. Service has
`load_state`, `active_state`, `result`, `exit_kind`, `exit_status`, `started_at`,
`finished_at`, `condition`. Each condition is exactly `passed`, `checked_at`:
timestamp null requires passed null; a real timestamp requires boolean passed.
`ConditionResult=no` with no timestamp means unevaluated, not skipped.

Accepted load states: `loaded`, `not-found`, `error`, `bad-setting`, `masked`,
`merged`, `stub`. Active states: `active`, `reloading`, `inactive`, `failed`,
`activating`, `deactivating`, `refreshing`, `maintenance`. Unit-file states:
empty, `enabled`, `enabled-runtime`, `linked`, `linked-runtime`, `alias`, `static`,
`indirect`, `disabled`, `masked`, `masked-runtime`, `generated`, `transient`, `bad`.
Service results: `success`, `resources`, `timeout`, `exit-code`, `signal`,
`core-dump`, `watchdog`, `start-limit-hit`, `protocol`, `exec-condition`, `oom-kill`.
Exit kind is integer 0..6 and status 0..255; kind 0 requires status 0; signal/core
kinds 2/3 require status 1..64. New enum values remain unsupported.

## Server interpretation and fixtures

Every assessment has `state` (`healthy`, `warning`, `unknown`), stable `reason`,
`incomplete` and `informational` booleans. All failures/unknown versions are
unknown/incomplete. Fstrim interpretation proceeds in this order:

1. Disabled/masked timer warns; missing/unloaded units are unknown.
2. Evaluated failed conditions are informational unknown, including containers.
3. Failed/inactive timer warns; transitional timer/service state is informational
   unknown. Service maintenance is not a completed inactive service.
4. Missing start/exit history is unknown even for default success/status 0;
   explicit failed service state warns. Missing one timestamp, kind 0 or a
   condition checked after the run started is inconsistent/unknown.
5. Completed unsuccessful service outcome warns. A missing timer trigger or one
   later than service start cannot confirm the latest trigger and stays unknown.
6. Require enabled timer, future next scheduled time and evaluated conditions.
   Only then is `fstrim_observed_success` healthy/complete within the defined
   systemd scope. This never asserts physical reclamation or every-device trim.

Current health is additionally gated by snapshot, credential/generation,
recovery latch, current contact and observation freshness. Historical service
timestamps describe available retained history, not a guaranteed last-boot record.

42 authored v1 JSON cases under `internal/skills/builtin/testdata/<key>/` are
Shared by Go's raw-output normalizer tests and TS's typed validator/evaluator
tests. They contain synthetic bounded execution/window inputs, expected typed
observation and expected assessment. Boundary tests add encoding, size, numeric,
recipe, execution, timestamp, version and data-exclusion proofs. New supported
formats require an explicit new fixture/version contract before use.

Primary format sources: [APT 3.0.3 output](https://sources.debian.org/src/apt/3.0.3/apt-private/private-output.cc/),
[APT 3.0.3 simulation](https://sources.debian.org/src/apt/3.0.3/apt-private/private-install.cc/),
[systemd 257 properties](https://www.freedesktop.org/software/systemd/man/257/org.freedesktop.systemd1.html).
No upstream implementation is copied into these parsers or fixtures.

## Persistent trim assessment version 3

This section owns persistent trim interpretation. New readings use assessment
version 3; retained version-1/2 readings keep their original assessment.

### Evidence and scope

Use observations already retained by the control plane. A read-only check found
the successful pre-reboot completion in the current credential generation's
stored runs. The agent still supplies fresh timer/service observations after
reboot; only the service's volatile completion fields are lost. Persist the
known outcome and expected deadline in server assessment context. This avoids
any journal reader, agent permission change, root helper, command profile, agent
binary rollout or fstrim unit modification. No raw journal import is needed.

Assurance is explicitly the **last observed systemd execution result** plus the
currently observed schedule. It does not prove every intervening execution, trim
on every device, or reclaimed capacity. Default `Result=success` with absent
completion metadata is never a successful execution. A timer trigger alone is
also not completion evidence.

Only same-host/agent/credential-generation, supported trim recipe/normalizer
evidence can contribute context. Preserve normal current-assignment, policy,
recovery, contact, retention and clock gates before using it for current health.
Interval/timeout edits within the same fixed trim recipe may retain execution
facts, because they change observation cadence, not the host's timer schedule.
A different recipe/version or credential generation starts new context. Never
carry a green current state across a source or authority gate.

### Storage and ordering

Add migration 011 with nullable bounded `baseline_runs.fstrim_context` JSONB
(object, at most 4096 bytes), and allow assessment version 3 in baseline runs,
history subjects and history events. Old rows and their constraints/meaning are
otherwise preserved. Stamp newly accepted runs with assessment version 3;
package/reboot results delegate to version 2. Preserve versions 1 and 2 exactly.
No agent payload, snapshot, wire version or request digest changes.

Compute trim context during the existing authorized ingestion transaction, after
snapshot validation and duplicate lookup, under the existing definition/agent
locks. Store it atomically with the run. Context contains its schema version,
the last evidenced terminal outcome (success/failure, nullable execution times,
source run identity/sequence and original observation time), the greatest known
timer trigger, and the earliest expected execution still awaiting confirmation.
Store only these bounded typed facts; do not duplicate entire observations.
Validate persisted context when reading it; malformed/unsupported context yields
unknown, never an implicit fresh start or healthy fallback.

Use accepted lower-sequence evidence only when constructing a run's immutable
context. A newer failed execution supersedes older success. Mere absence of
service timestamps after reboot does not erase an established result. Do not
search for any historical success while skipping a newer failure. Incomplete,
inconsistent or failed current collection retains the existing unknown result;
the remembered outcome cannot make an unreadable current timer healthy.

Reuse the previous compatible context and incorporate newly available older
terminal evidence when needed, including delayed queue delivery. Establish the
initial context from eligible retained v1/v2 observations in sequence order;
older rows themselves remain untouched. Bound queries by the 90-day retention
window and existing scope indexes. Context assembly belongs to ingestion, not
every dashboard/email/history read. Out-of-order arrivals must not mutate a
later run's context or displace the highest-sequence current run. The next fresh
run can incorporate a delayed result if no newer evidence supersedes it.

Copied execution facts retain their original source age; copying must not renew
their retention lifetime. Drop expired supporting details from new contexts and
ignore expired facts on reads. An outstanding expected deadline remains minimal
current monitoring state, so expiry cannot repeatedly grant a new grace period.
Use no FK that prevents normal source-run retention. Exact retries, including
receipts after expiry, retain their original response and do not rebuild context.

### Schedule and outcomes

Keep the existing observation cadence and `3 * interval` freshness rule. Those
measure whether the observer is reporting. The execution deadline instead uses
systemd's reported `next_elapse`; do not equate it with the hourly observation
interval or invent a daily execution requirement.

Use a fixed **24-hour execution grace period** for this trim check. Remember the
earliest outstanding expected run; a later report of next week's date must not
erase this week's missing result. Earlier observed next times can tighten the
pending deadline. Reboots, fresh observations and timing-only policy edits do
not restart it. A later timer trigger without matching completion likewise
cannot advance it. If monitoring begins without retained execution evidence,
establish the first deadline from the first verified upcoming run, without
inventing a failure for the period before monitoring.

A verified newer successful execution fulfills the pending expectation when it
finishes at/after that expectation, or demonstrably covers an advanced timer
trigger (allowing systemd's randomized schedule to shift across restart). A
manual success before the expected run does not continually postpone that run.
After fulfillment, arm the currently reported future next run. An explicit
failed service or failed execution warns immediately and remains the last known
failure until a demonstrably later success; default empty post-reboot fields
cannot clear it. Failure with no completion timestamp uses its observation time
as the boundary a later success must exceed. Clock ambiguity stays unknown.

| Fresh eligible evidence | State and meaning |
| --- | --- |
| Enabled/active timer, verified recorded success, outstanding execution not yet due | Healthy: last observed run succeeded; show last execution and next scheduled run. |
| Valid schedule, no recorded execution yet | Healthy with incomplete/informational flags: **Scheduled — awaiting a recorded run.** No successful execution is asserted. |
| New trigger or expected run reached, result not observed yet, within grace | Healthy with incomplete/informational flags: **Awaiting scheduled result.** Keep any older success explicitly historical. A remembered failure still warns. |
| Deadline plus 24 hours reached without a qualifying successful execution | Warning: **Scheduled result overdue.** State the expected time and absent confirmation; do not assert the command never ran. |
| Disabled/masked/inactive/failed timer, or latest known service failure | Warning, with the specific existing reason. |
| Missing/unsupported units, failed conditions, invalid clocks, malformed or unavailable current observation | Existing unknown/informational meaning with the specific reason. |
| Contact or observation has expired | Existing outer contact/stale result; remembered trim success cannot override it. |

An observed running execution uses the pending-result state during its deadline
grace; it cannot hide a known failure or remain passing indefinitely. A valid
schedule may pass its limited check while execution assurance is incomplete,
as version 2 already does for clean package/reboot checks. This explicitly
supersedes the old trim requirement for current-boot execution metadata and
service condition timestamps when using retained successful execution evidence.

For historical run views, evaluate version 3 at that run's recorded finishing
time using its stored context. For current health, apply the same evaluator at
the server's captured `as_of` after the existing eligibility gates. Include the
next future pending-result/deadline transition in `valid_until` where it precedes contact or
observation expiry, so browser freshness and independent samplers agree. No read
mutates context, and no historical v1/v2 result is reinterpreted.

Systemd's [v257 timer documentation](https://raw.githubusercontent.com/systemd/systemd/v257/man/systemd.timer.xml)
describes calendar accuracy/randomized delays and persistent catch-up behavior.
The grace is a TinyWarden policy choice, not a systemd guarantee. The agent's
reported upcoming time supplies the schedule; arbitrary calendar parsing is
outside this correction. Moving a host timer to a later cadence cannot silently
forgive an outstanding deadline; the next successful execution reconciles it.

### Shared consumers

`server/skills` owns this interpretation for detail, fleet, email and observed
history. Expose last observed execution, upcoming run and pending deadline as
typed facts. Show **Online** from contact independently of each check state in
server cards/detail; healthy rows also have an explicit connection label. Keep
all owned copy in the English catalog.

The assessment-version change is a history context transition, not evidence of
a physical host repair. Notification rules remain unchanged; use their existing
Shared assessment path and describe limited assurance in recovery text.
