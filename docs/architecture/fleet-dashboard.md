# Fleet dashboard and scoped assessments

[UI](../ui/contract.md) owns appearance and controls;
[change history](change-history.md) owns observed transitions. Existing protocol,
source, authority and freshness gates apply. [Assessment version 3](baseline-normalizers.md#persistent-trim-assessment-version-3)
extends trim interpretation with retained execution/schedule context and explicit
connection labels. New readings use that assessment; historical meanings remain
unchanged.

## Per-run assessment compatibility

The agent checks assignment evaluator IDs against its compiled recipes. Keep
`package-plan.v1`, `reboot-marker.v1`, `fstrim-systemd.v1`, their normalizers,
recipes, assignment digests and wire DTOs unchanged. An evaluator-ID bump is not
needed for the approved change in server interpretation.

Migration 010 originally adds `baseline_runs.assessment_version`, an integer constrained to
1 or 2, non-null with default 1. The later trim migration extends the constraint
to version 3; existing rows and old writers retain their recorded version.
Version-2 readings are stamped separately from the wire evaluator, after the existing
authority/snapshot validation and duplicate lookup. The first stored version is
immutable. Exact retries return their original outcome without restamping; changed
retries still conflict. This field is server metadata, excluded from the agent's
request digest. Expired-run receipts retain their existing retry contract; they
need no assessment field because they no longer render observation history.

`server/skills` owns both interpretations. Version 1 preserves every existing
fixture and reason. Version 2 changes only these fully validated observations:

| Evidence | Version 2 result | Required explanation |
| --- | --- | --- |
| Successful supported package simulation; all four counts zero | `healthy`, `package_plan_clear` | No changes in the local package plan. Cached metadata may be outdated; this is not security-update assurance. |
| Successful supported reboot-marker observation; marker absent | `healthy`, `reboot_marker_absent` | No package reboot marker observed. Running software may still need a reboot. |

Keep `incomplete=true` and `informational=true` for those two limited assurances;
neither flag alone changes the state to unknown. Explain the assurance limit,
rather than implying collection failed. Invalid, partial, unsupported or failed
collection remains unknown. A present reboot marker remains warning. Package
changes/removals and fstrim meanings are unchanged. Unsupported assessment versions
fail closed. No collection command or agent rollout changes.

Current and historical detail, fleet and email consume this same projection.
History uses the run's stored version plus original snapshot; it never applies
version 2 retroactively. Display both wire evaluator and server assessment version
in protected provenance. Previously accepted clean version-1 readings remain
unknown until fresh version-2 readings arrive. A retry is not a fresh reading.

Notification routing, exposure and recovery rules remain those in
[N01](notifications.md). A fresh scoped pass can clear an exposed same-scope problem
under those rules; recovery copy must describe the limited check. Version 2 alone
does not reset email cursors or replay history. Test this affected consumer without
real email. The UI history comparison scope includes assessment version, so an
interpretation change is not presented as a physical repair.

## Current server groups and facts

Current evidence continues to require authoritative host/agent/generation,
unrevoked credentials, current contact, desired source/policy, supported
applicability, no recovery latch and unexpired readings. Highest accepted sequence,
retention receipts and conservative clocks keep their existing precedence.

| Available current evidence | Exclusive group and priority |
| --- | --- |
| At least one known critical disk problem | Needs attention; critical first |
| At least one known warning, including a reboot marker | Needs attention; warning |
| No known current problem, but contact or any required check is unavailable, unknown, stale, revoked or not applicable | Unknown or stale; retain the specific reason |
| Current contact and all four required checks pass | Healthy; explicitly limited to those checks |

Preserve uncertainty alongside a known problem. In particular, a valid fresh disk
run with incomplete filesystem coverage can contain a known critical/warning mount:
show that problem and the coverage warning, even though overall disk assurance is
unknown. Do not promote a mount from expired, wrong-source, wrong-generation or
otherwise ineligible evidence into a current problem. Historical warnings remain
explicitly last-known evidence and cannot support current Healthy or attention.
Revoked hosts remain visible in the uncertainty group.

The checks owner supplies a typed current disk-attention fact after all outer
eligibility gates, separately from overall assurance. Existing detail/email policy
for incomplete overall disk evidence remains unchanged; the dashboard does not
silently broaden email eligibility. All consumers use the same underlying facts.

Show the most-used eligible writable local filesystem, with protected mount path
and exact-integer-derived severity. Break equal usage ties by path and mount ID.
Read-only mounts remain informational; shared capacity is not summed. Mark partial
coverage. Do not claim a numeric change across different mount identities or
incompatible source/assessment scopes. No eligible reading means unavailable,
never zero usage. All four check chips remain visible with their own states.

Fleet total and group counts cover the whole authorized fleet, independent of
visible pagination. The summary/bar use these exclusive groups; mixed evidence is
explained on the host card. Contact cadence, disk cadence and each baseline cadence
are independent. Do not claim one synchronized full check.

## Authorized reads and bounded projection

`server/fleet` owns the operator dashboard root and rollup. `server/skills` owns
pure assessment/projector functions and bounded current-evidence adapters. History
consumes these owners; they do not import the history writer. Reuse existing pure
rules across detail, notifications and dashboard instead of copying classifiers.

Dashboard reads use one PostgreSQL repeatable-read snapshot and captured UTC
`as_of`, with the existing operator guard and fresh completion/session recheck.
The bulk evidence adapter reads versioned rows and authority from that snapshot;
it does not acquire family write/shared locks or reuse mutation-oriented locking
roots. Atomic receipt transfers remain coherent within the snapshot. Concurrent
changes appear on the next read. Serialization/timeout failures are unavailable,
not an empty success. No domain writes occur in renders, browser polling or GETs;
the established guarded session renewal remains permitted.

Scan stable host-ID batches of at most 50, reading only latest required runs and
bounded disk facts, not five-run detail histories. Use set queries per batch, not
per-host HTTP/database calls. Accumulate group counts and bounded requested pages;
do not hold all observation bodies. Bound the root to 20 seconds and each statement
to 5 seconds. If the scan cannot finish, return unavailable rather than partial
counts labelled as fleet totals. No persistent current-health cache is introduced.

Each group returns up to 25 hosts with a group-bound, validated keyset cursor and
stable ordering: severity priority, then creation time and host ID. Counts are
fresh for each read; pagination is not a historical snapshot across requests.
Explicit refresh resets cursors. Bound cursor input and reject malformed/mixed-group
values. Response includes `as_of` and earliest definitive-state expiry. Existing
request-duration/monotonic expiry, failed-read and permission-loss handling apply.

History enrichment is an authorized bounded read. A card's since-time must match
the displayed subject, state and identity/source/assessment scope with continuous
capture. Label it as first observed; do not substitute last reading time for incident
start. For aggregate Healthy use the latest continuous passing start across all
required subjects. If that cannot be established, omit the since-time and show the
sample time. A missing history record never blocks current health.

## Routes and migration boundary

Keep `/fleet` and `/fleet/[id]`. Add guarded `/settings` for all four global editors
and `/history` for retained changes. Keep host overrides and detail functions.
Use thin guarded transport roots; no system HTTP endpoint, new account role or
anonymous fleet metadata. All new states, limits and feedback use English catalogs.

Migration 010 is additive and also introduces the history-owned tables. Old
observations, request digests, assignments and migrations 001–009 are immutable.
Do not deploy until web and maintenance ledger checks support 010 together.
Pin compatible [native job bundles](../deploy/native-release.md#job-bundle-isolation)
before editing source consumed by active jobs.
