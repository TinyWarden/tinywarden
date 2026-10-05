# Individual setting overrides and server page

Customized fields stay fixed while fields left at default follow later global
changes. Schema2 host forms and migration 013 support this saved intent.
This contract supersedes complete-override rules for new host edits in
[disk definitions](check-definitions.md) and [baseline delivery](baseline-protocol.md).
[Global enablement](skill-enablement.md), retained trim context and immutable
observation/receipt rules continue to govern their respective boundaries.

## Saved intent and effective values

An override is an explicit set of field names and their saved values. Omitted
fields inherit. Empty set means the entire skill inherits. Resolve a complete,
validated tuple on the server before display, assessment or agent delivery.

| Skill | Fields that may be customized |
| --- | --- |
| Disk space | warning_percent, critical_percent, interval_seconds |
| Package updates | interval_seconds, timeout_seconds, package_mode |
| Reboot status | interval_seconds, timeout_seconds |
| Filesystem trim | interval_seconds, timeout_seconds |

Reboot/trim package_mode remains the fixed internal `upgrade` value. Disk timeout
remains fixed at 10 seconds. All current bounds, recipes, capabilities, evaluators
and supported distributions remain authoritative. No extra observations/settings.

A saved custom value remains custom even if a later global default equals it.
Never derive saved intent from equality with the current defaults. A per-field
Use default action explicitly clears its override; Use global defaults clears
all overrides for that skill. Changes remain drafts until Save. Entering the
custom-settings mode alone creates no overrides. Editing an inherited field away
from its displayed default creates one; reverting that new draft field to its
captured default before Save removes it. Previously saved overrides require the
explicit reset action to inherit again. Show Custom by saved/draft intent, even
when its value currently matches the default; the badge counts those fields.

Example: custom warning90, inherited critical95/interval300. A global change to
warning80/critical97 yields warning90/critical97/interval300 for that server.

## Storage and existing policies

Migration013 adds nullable `override_fields text[]` to both immutable host policy
revision tables. NULL identifies the old complete-policy representation. New
revisions store a canonical, sorted, duplicate-free allowlisted field array;
empty requires mode inherit, nonempty requires mode override. Enforce array shape,
allowed fields by definition key, no null elements/duplicates and mode consistency
in storage and the parser. Existing complete tuple constraints and foreign keys
remain in force. For a new nonempty override, existing value columns store the
complete resolved tuple at save time; the mask identifies the authoritative custom
columns. Other columns are historical save-time context, never live defaults.
Keep pinned_definition_revision as that save's source revision. Inherit rows keep
existing null tuple/pin representation. No new policy head or version counter.

Existing rows, snapshots, observations, digests and receipts are not rewritten.
An old inherit row resolves as empty overrides. An old complete override resolves
as all editable fields explicitly custom, retaining its saved tuple and pinned
source. Old forms stored complete choices and cannot prove which fields were left
at default. Do not guess intent by comparing values to today's or old defaults.
Expose the resulting per-field controls so the owner can explicitly release fields.

Migration is transactional and additive; existing grants/role remain. Downward
migration refuses destructive rollback. Historical policy rows remain resolvable
by their version after heads advance, including the mask interpretation.

## Operator mutations, conflicts and replay

Use the existing host-policy routes with host-policy request/response schema2.
The new POST is exactly schema_version, request_id, expected_policy_version,
expected_default_revision and overrides. `overrides` is a complete replacement
object containing only customized, allowlisted field/value pairs; `{}` resets all.
Mode is derived, not another independently supplied instruction. Global-definition
and agent schemas remain unchanged. Reads expose defaults/revision, saved policy
version, overrides, resolved effective values and existing delivery metadata.
Old schema1 host mutations may only replay an already-recorded exact receipt;
otherwise return a catalog-backed 409 client_outdated requiring page reload.
This avoids an old browser silently replacing field intent with a full tuple.

Preserve current authorization, Origin/CSRF/body bounds, actor and clock rechecks,
definition-before-host lock order and baseline sorted definition-lock order.
Reuse owning receipt tables and audit roots. V2 fingerprints use a version2 tag,
root/key/host, both expected versions and canonical ordered override pairs. Preserve
the old V1 fingerprint calculation for replay; never rewrite previous fingerprints.
Under authorization and locks, check exact receipt before preconditions, including
no-op replay. Changed request reuse conflicts; stale policy OR default revision
conflicts. Masks and custom values determine policy equality: a reset can be a real
change even if today's effective numeric tuple stays equal. Each actual change
appends one policy revision/audit/receipt; no-op does not repin or advance counters.

Validate the merged tuple under the locked current default head. For disk, partial
overrides introduce a cross-field constraint: warning must remain below critical.
Before committing a global default change, validate its merge with every current
policy that inherits at least one field, including Off/revoked records. The existing
exclusive definition lock serializes against policy writes using shared locks.
Use an indexed set query over current heads; no host mutation loop or network I/O.
If any merge is invalid, reject the whole default edit with 409
default_override_conflict and actionable catalog copy. No silent clamping, custom
value rewrite, partial global update, failed-edit receipt or arbitrary winner.
An optional bounded list of conflicting hosts may aid the UI; completeness must
not depend on that display limit. Existing bounds make baseline field merges valid
independently; retain their complete-tuple validation nevertheless.

## Resolution, agent delivery and shared consumers

Provide one resolver per existing disk/baseline boundary and reuse it for host
settings reads, assignment fetch and current evidence/projection. Overlay only
custom fields onto current defaults. All-fields-custom policies use their pinned
source; any inherited field uses the current default source. The baseline resolver
continues to build the exact allowlisted recipe from resolved values.

Keep definition_revision, policy_version, mode inherit/override and existing
assignment/digest shapes. Partially inherited policies therefore advance desired
definition scope when the default head advances; this may require a new reading
even if that particular edit touched a customized field. This follows the existing
revision-based freshness rule. Fully customized policies remain pinned. Identical
polls reuse assignments; policy/reset/default/control/generation changes follow
existing snapshot equality and monotone delivery rules. Do not invent a per-field
agent protocol, extra poller, server-wide policy rewrite or new agent capability.
Current agent0.0.2 already accepts complete resolved assignments within these bounds.

Update disk evidence's current source selection as well as the assignment builder;
Baseline evidence must use the same resolver as baseline delivery. Shared dashboard,
history and notification scope must agree with desired policy/default/control
identity. Old evidence cannot establish the new settings' current health. Accept
valid queued/in-flight runs against their original snapshots as historical evidence;
do not reinterpret them with current defaults or erase sequence/credential state.
Retain global enablement global Off precedence, re-enable freshness and old claimed-send rules.
Keep persistent trim durable execution/schedule context across policy changes and restarts.
Settings changes are context changes, never a fabricated physical recovery.

## Server page presentation

Match the supplied server template using shared brand/navigation, current skill
names and1240px content width. Header/contact facts use real inventory. Server
history opens the existing `?host=` filter; Jump to skill searches the four cards.
Use existing current-state assessments, including Critical, Warning, Unknown,
Stale, Disabled and informational/unsupported evidence; Disabled is not attention.
The fleet navigation count/title/favicon retain their shared fleet meaning.

Disk table shows real mounts, capacity bars/thresholds, filesystem type, state and
Shared-capacity/reason context. Fold read-only informational mounts only when any
exist. Preserve coverage/excluded counts and all recent-run evidence/provenance.
Package card displays current aggregate counts; omit the unavailable package-name,
version, pending-age and cache-date table. Reboot shows its marker and scope limits;
omit kernel/uptime. Trim uses observed execution/schedule/context and its established
assurance wording. No invented dates, sample revisions or current reinterpretation
of historical runs. Display up to the existing five retained readings per skill.

Each card opens a settings dialog with defaults, individual overrides, Reset to
default controls, Save/discard and truthful delivery status. Preserve dirty drafts,
version conflicts, exact uncertain retry and permission clearing. Include keyboard
focus containment/return and accessible labels; closing/navigating with unsaved
changes must use the existing discard guard. Link global settings to the selected
skill (add selection handling if required). Compare against the captured defaults
while editing; a concurrent default change produces a save conflict, not a silent
draft rebase. Display recorded delivery as delivered, not confirmed execution.

Refresh displayed reads every60 seconds and offer manual refresh. Reuse bounded
read cancellation/permission/stale handling; preserve open dialogs, focus and drafts.
A read refresh does not execute skills or guarantee agent delivery within60 seconds.
Use the existing English catalogs and display-time convention, responsive tables
and conditional disclosures. All existing detailed evidence stays accessible.

## Recovery compatibility

After partial policies exist, older code treats stored save-time tuples as complete
overrides. Use compatible forward repair rather than an old-code-only rollback.
Preserve source identities and compatibility evidence in private release records.
