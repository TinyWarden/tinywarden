# Skills and global enablement

Four installed skills share global enablement controls. Global Off dominates
host field overrides, stops new scheduling and removes the skill from current
attention without deleting historical readings. The same control scope governs
dashboard, detail, history and email projections.

## Approved product scope

- Four built-in skills: Disk space, Package updates, Reboot status and Filesystem
  trim, in Storage and Packages categories. Other reference entries are examples.
- Match the supplied Skills page's catalog/detail layout, search, enabled/disabled
  filters, descriptions, usage disclosure, settings and individual save/discard.
- Global Off applies even to servers with custom settings. Preserve settings and
  historical readings; disabled skills do not contribute attention or send alerts.
  On restores saved settings. Contact monitoring remains independent.
- Retain existing thresholds, observation intervals, baseline time limits and APT
  modes. Do not add inode monitoring, network mounts, ignored paths, delayed update
  warnings, a configurable trim age or editable disk-check time limit.
- Claim compatibility only with tested Debian 13. Use real configuration revision
  and save time. Keep catalog-only English copy and existing mutation/draft guards.
- Describe APT's limited cached simulation truthfully, retain persistent trim's scheduled trim
  interpretation and preserve the package reboot warning. Marketplace remains future.

## Global owner and mutation

Add `enabled` (initially true), `enablement_version` (initially 1, positive safe
integer) and `enablement_changed_at` to the existing disk/baseline definition
heads. Global enablement is read from that head even when a host pins an older
configuration revision. Toggling does not change configuration revisions, values,
host policies or recipes. Configuration edits while Off remain allowed and do
not enable the skill. Each actual On/Off change increments the enablement version;
same-state requests are no-ops. Reject exhausted counters and clock rollback.

Use a bounded authenticated `GET /api/v1/operator/skills` for the four current
entries and `POST /api/v1/operator/skills/[key]/enabled` with exactly
`schema_version:1`, `request_id`, `expected_enablement_version`, `enabled`.
Reuse operator origin/CSRF guards, request bounds, authority and completion-time
recheck. Lock the existing owning definition head exclusively for mutation;
Baseline operations retain their existing sorted definition-lock order. Existing
operator/session locking serializes one operator's request IDs across skills.

A dedicated `skill_enablement_receipts` table is the durable mutation and audit
ledger for this new root. Record operator, request ID, key, fingerprint, previous
and resulting enabled values/versions, changed flag, completion time and
correlation ID, atomically with the head. Unique `(operator_id,request_id)`;
matching replay returns its original receipt, differing reuse returns 409;
stale expected version returns 409 without changing anything. Constrain actual
changes to one version increment and a Boolean flip; no-ops keep the version.
Do not reuse configuration revision audit fields to represent enablement.
This ledger follows existing durable configuration-receipt retention and access
rules. No new generic audit subsystem or user-facing audit page is required.

Reads return the real configuration revision/`created_at` as the settings save
metadata, plus the independent enablement state/version/change time. Label a
displayed revision as the settings revision; never invent a combined counter.
All-entry reads use one consistent transaction and the existing completion guard.

## Assignment identity and agent behavior

Add `enablement_version` default 1 to disk/baseline assignment snapshots. Include
it in server-side assignment equality. A changed version always produces a new
assignment ID and delivery revision, even for On → Off → On between two polls.
The existing digest binds the delivery revision and applicability, while known
assignment checks also bind its ID: retain the wire shape, digest algorithm,
known-assignment checks and old snapshot digests.
The control counter need not be added to the agent wire format.

Update the agent to advertise `skill-control.v1` on both assignment endpoints and
accept `applicability:"disabled"` in both assignment/cache validators. This
capability describes protocol understanding, independently of OS/execution
capability. Disabled disk assignments have no checks; disabled baseline
assignments retain their validated recipe but are never scheduled. For an agent
without this capability, an Off skill is delivered as `missing_capability` with
no executable disk check / a non-ready baseline. This is a genuine missing
control-protocol capability, not an unsupported-OS fiction. Operator presentation
still uses the authoritative global Disabled state. Enabled legacy delivery
retains the existing applicability rules.

Keep the existing 60-second polling and 24-hour cached-assignment lease. Once an
Off assignment is accepted, schedule no further runs for that skill; permit an
already running bounded observation to finish. Keep uploads and the other skills
running. An unreachable agent may continue its cached observational work until
its existing lease expires. UI wording says agents apply the setting on their
next connection; it must not claim instantaneous remote acknowledgement. The
server's attention and notification exclusion takes effect at toggle commit.

Persist disabled assignments before treating them as accepted. Restart must
preserve Off and normal lease/clock rules. After On, a new assignment resets that
skill's due time so a fresh reading is collected promptly, independent of its old
scheduled due time. Do not convert global Off into the agent's terminal recovery
pause latch; it must resume by normal polling.

Continue accepting valid, authorized late/queued runs against their original ready
snapshots, with normal duplicate receipts and immutable assessment. Never accept
a run against a disabled snapshot. Current projection requires snapshot control
version equal to the head and a run belonging to that current snapshot. Thus
late pre-Off readings remain historical and cannot become fresh on re-enable.
No queue deletion, sequence reset, credential replacement or global policy bump.

## Shared current state, history and email

`projectDisk` and `projectBaseline` receive current control state/version. Off
returns `state:"disabled"`, `reason:"skill_disabled"`, no current attention,
worst-disk/fact/deadline, and no current reading presented as live. Preserve
explicitly historical readings and their recorded assessments. Carry the same
control through fleet batch evidence, detail reads and system summaries.

After On, unmatched control/snapshot/run identity means Unknown with explanatory
waiting-for-new-reading copy. Do not substitute the latest old run. Retained
persistent trim trim completion/schedule evidence can still support the existing persistent trim assessment
of a fresh current observation; toggling does not reset or extend trim deadlines,
discard durable completion evidence, or change trim interpretation.

Fleet rollup excludes Disabled checks from critical/warning/unknown priority,
counts, primary reason and disk figures. Shared navbar/title/favicon and mascot
use that same rollup. Render Disabled neutrally wherever the check remains
visible. Contact remains independently monitored. With every skill Off and the
agent online, the host can occupy the existing clear/healthy group, but show
"All skills off" rather than claiming four passing checks.

Add `enablement_version` default 1 to history subjects/events and notification
cursors and include it in both continuity comparisons. Contact uses constant 1.
Normalize an absent field in old stored history scope JSON to 1; do not rewrite
old facts, reasons, timestamps or assessment versions. Extend history state
constraints/parsers/UI to accept Disabled, without adding a new event kind.

History samples Off as Disabled with empty facts and `suspend:false`; a change
of enablement scope produces the existing `context` event, with copy explaining
that monitoring was disabled or resumed. It is not a health recovery or an
observation failure. Subsequent Off samples produce no repeated events. For an
enabled skill, existing contact suspension applies. Rapid Off/On still changes
scope even when no worker sampled Off; resume becomes a context/baseline rather
than a transition from an old unhealthy reading to healthy. An unsampled
intermediate switch is retained in the mutation ledger, not fabricated as a
sampled host event. Preserve initial-baseline and retention behavior.

Disabled summaries have `eligible:false`. Sampling retires their old notification
cursor and cancels pending mail through existing transition ownership. Include
enablement version in cursor matching so an Off/On cycle also retires old mail
and exposure state when the worker missed Off. After a fresh re-enabled result,
an issue may start a new alert; a clean reading must not send a recovery for the
pre-disable issue.

Notification claim retains its owning definition share lock through the claim
transaction. An Off commit before claim prevents that claim. A send already
claimed before Off may finish and is recorded honestly; no promise to recall
in-flight SMTP. Late completion can update only the retired cursor and cannot
make the new enablement scope exposed. No bulk per-host work in the toggle root.
Use existing lock order: authority (operator roots), definitions, host/agent,
policy/current evidence, then system route/cursor/outbox ownership. Fleet display
reads keep their existing consistent MVCC snapshot rather than new writer locks.

## Page behavior

Apply the supplied visual reference to four real entries and supported controls.
Navigation/title become Skills; preserve old settings links through the route or
a redirect. Marketplace stays unavailable. Show only Debian 13 compatibility and
retain the existing tested architecture restriction. Existing server detail
styling stays outside global enablement, but add the functional Disabled presentation there.

The global toggle saves separately and immediately; show a pending state and
settle the switch only from a confirmed response. Preserve configuration drafts
on selection/filter changes and enablement mutations. On ambiguous mutation
failure retain that exact request for retry; block another conflicting toggle
until resolved, with existing refresh/conflict/session-expiry behavior. Save and
Discard apply only to the selected skill's configuration. Use existing server
validation bounds, English catalog and before-leave safeguards. Show no unsupported
settings, fabricated revisions/dates or sample servers.

A replay receipt acknowledges its original operation, not necessarily the current
head. Re-read current state after acknowledgement; reject late responses with
older control versions and preserve unrelated drafts. Refresh shared fleet status
after a confirmed toggle, invalidating any older in-flight status read so it cannot
restore the previous badge/count. Existing refresh-failure labels still apply.

## Storage and recovery compatibility

Migration 012 installs global controls, snapshot/scope columns, the mutation ledger
and Disabled applicability/history state. Existing skills are seeded On at version 1.
PUBLIC grants remain revoked. All consuming jobs must understand Disabled before
controls change. Keep fixed job artifacts compatible with the schema and web code.

Older agents must not be run against unreadable disabled caches. A downgrade needs
proven readable saved state and preserved identity/sequences. Once new control
versions or Disabled history exist, use compatible forward repair; do not blindly
restore old state or reset counters. Re-enabling does not revive old current evidence.
