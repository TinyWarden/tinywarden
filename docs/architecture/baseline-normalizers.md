# Baseline normalizers and evaluators v1

P3.B implemented 2026-09-29. This document owns the exact local typed evidence,
format/range rules and server classification. [Baseline observations](baseline-observations.md)
owns delivery, current-health gates and P3.C integration; [recipe execution](recipe-execution.md)
owns execution admission and containment. These interfaces are not yet wired to
the connected agent, wire protocol, persistence or operator views.

## Ownership and recipes

`agent/internal/baseline` constructs fixed recipes and converts transient runner
buffers into typed evidence. It has no credential, health, scheduler or persistence
dependency. `apps/web/server/checks/baseline-values.ts` strictly validates that
evidence; `baseline-evaluation.ts` alone classifies it. All visible reasons and
scope limits belong to `apps/web/messages/en.json` under `baseline`.

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
P3.C must gate Debian 13/amd64 applicability and advertise capability only after
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

P3.C must additionally gate current health by snapshot, credential/generation,
recovery latch, current contact and observation freshness. Historical service
timestamps describe available retained history, not a guaranteed last-boot record.

42 authored v1 JSON cases under `agent/internal/baseline/testdata/<key>/` are
shared by Go's raw-output normalizer tests and TS's typed validator/evaluator
tests. They contain synthetic bounded execution/window inputs, expected typed
observation and expected assessment. Boundary tests add encoding, size, numeric,
recipe, execution, timestamp, version and data-exclusion proofs. New supported
formats require an explicit new fixture/version contract before use.

Primary format sources: [APT 3.0.3 output](https://sources.debian.org/src/apt/3.0.3/apt-private/private-output.cc/),
[APT 3.0.3 simulation](https://sources.debian.org/src/apt/3.0.3/apt-private/private-install.cc/),
[systemd 257 properties](https://www.freedesktop.org/software/systemd/man/257/org.freedesktop.systemd1.html).
No upstream implementation is copied into these parsers or fixtures.
