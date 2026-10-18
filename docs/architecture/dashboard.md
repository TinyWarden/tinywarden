# Dashboard customization

On Dashboard (`/dashboard`), **Customize dashboard** selects the information shown for each server.
Server identity, contact and health are always visible. Optional columns start
empty. Server information comes first, followed by skills and their fields
alphabetically. Up to32 optional columns can be selected. The same selected fields
appear in healthy rows and attention/unknown cards. Selection never changes health,
skill enablement, alerts or recording.

**Show today's changes** starts enabled. The sidebar appears when eligible changes
exist since midnight. Hiding it leaves capture and History active. Layout belongs
to the signed-in operator and survives reload and compatible skill updates.

## Skill health columns

Every installed skill offers a platform-owned **{skill name} health** option in
Customize dashboard, including skills without declared dashboard fields. For
example, expand Services and select **Services health**, then Save. It starts
unselected and uses the same per-operator preferences as other optional columns.

The compact cell contains only the shared unboxed row status: Healthy, Warning, Critical,
Unknown, Stale, Disabled or Not configured. It uses the engine's current aggregate
projection, including runtime/contact, assignment and freshness eligibility. It
does not recompute health from counts, expose resource details or use a retained
sample. A failed or expired dashboard read renders active health cells Unknown;
disabled skills stay Disabled. An empty Services selection is Not configured, never
Healthy. Open the server for individual services and their reasons.

This option works for any installed skill without a package declaration or release,
agent update or per-skill renderer. Its identity is separate from authored fields.
It supplements the package's maximum of eight fields (up to nine catalog choices
per skill); the overall limit remains 32 selected optional columns. Existing saved
layouts and skill author APIs are unchanged.

## Table layout

Primary group/server statuses remain boxed Playbook state pills. Secondary
connection and agent-update labels use quiet inline metadata tags, retaining their
wording and update tooltip. This presentation does not change contact, health or
update eligibility. The Agent settings dialog keeps its primary update-state pill.

Healthy servers use one native Playbook table so the column headings, cells,
backgrounds and separators share the same width. Server identity takes the
remaining space; optional columns have bounded widths appropriate to their type.
Meters get more room than small numeric values. Widths are generic and do not
branch on skill identity. The selected fields and their alphabetical order stay
under the existing dashboard preferences.

The Server column stays visible during horizontal scrolling. Narrow screens use
the shared stacking table with field labels; meters span the available row width.
A server name is a normal keyboard-accessible link, and an ordinary click elsewhere
in its row still opens that server. More selected columns can require horizontal
scrolling on desktop; headers cover the complete table, including the scrolled area.

## Skill author API

Add optional `dashboard: {fields: [...]}` to display.json formats1 or2. This is a
closed, statically validated block of1–8 fields within the existing64 KiB display
limit. Each field has id, type, label_key, value and optional context:

```json
{
  "dashboard": {"fields": [{
    "id": "used", "type": "meter", "label_key": "used_label",
    "value": {"fact": "used"}, "context": {"fact": "mount_path"},
    "min": {"value": 0}, "max": {"value": 100},
    "thresholds": [
      {"at": {"setting": "warning_percent"}, "severity": "warning"},
      {"at": {"setting": "critical_percent"}, "severity": "critical"}
    ], "status": "assessment"
  }]}
}
```

This block supplements required sources and sections. Declare used as a percent
scalar, mount_path as text, and used_label in the catalog. For a simple value use
`type:"value"` and omit meter properties. Both bindings contain only fact;
context is text and value is a scalar. Compute derived values in evaluate: the app
never reduces tables or executes expressions. Use existing
[display units/encodings/enums and meter rules](skill-display.md). Thresholds resolve
against the eligible reading's assignment settings. Shared components format all
output; no HTML, CSS, scripts, SQL, custom templates or chart/table cells.

IDs follow `[a-z][a-z0-9_]{0,63}` and are unique within the block. Labels are
parameter-free catalog entries capped at128 UTF-8 bytes. Saved identity is
`(manifest.id, field.id)`, independent of version, digest, installed UUID or label.
Renaming a label keeps selection; added fields stay unselected. Do not reuse an ID
for a different meaning: incompatible changes need a new ID. Removed fields remain
explicitly unavailable until deselected; reinstalling the same identity restores
selection. Packages without declarations remain supported.

Only current eligible assessments supply values. Generation, credential, package,
settings/policy, runtime/contact and freshness checks all apply. Retained samples
never replace expired or ineligible current data. Partial Unknown readings may
show their actual values with Unknown status. Missing values never become zero,
No or Healthy. Text/context shorten at192 UTF-8 bytes with a notice; numeric data
retains exact encoding and is never shortened into another number.

Dashboard declarations require updated trusted Python runtime assets with dashboard
support introduced2026-10-10. Update app and agent runtime assets before installing
packages that use this extension. Older validators reject the extra block. The
Go launcher, package wire protocol and collector need no change. Subsequent skills
using this API require no per-skill core update. The independent memory-pressure
example provides a complete meter declaration. See the
[agent SDK](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/sdk-v1.md).

## Saved layout API

Authenticated GET `/api/v1/operator/dashboard/layout` returns schema_version1,
as_of, revision, layout, catalog and resolved columns. Reading does not initialize
preferences. POST uses existing same-origin operator JSON headers and accepts
schema_version, request_id UUID, expected_revision decimal string and layout:

```json
{
  "format": 1,
  "sections": [
    {"id": "servers", "type": "server_table", "columns": []},
    {"id": "changes", "type": "change_feed", "visible": true}
  ]
}
```

Column refs are `{kind:"server",field:"os"|"agent_version"}`,
`{kind:"skill",skill_id:"publisher/skill",field_id:"field_id"}` or
`{kind:"skill_status",skill_id:"publisher/skill"}` for platform-owned health.
The additive health ref keeps layout format and response schema version 1; it has
no `field_id` and cannot collide with a package field named `status`. Server is
implicit. Sections are closed; columns are a unique set, not a saved rank. Future
widgets will use explicit validated section versions. Owner comes only from the
session. Save bodies are capped at16 KiB, catalogs at1 MiB and fleet responses at
4 MiB with byte-aware group paging. Full settings/assessments/source tables are
excluded from compact cells. Catalogs load for the editor, independently of polls.

Before downgrading to an app version without health-column support, deselect these
columns or restore a compatible saved layout. Older strict parsers cannot read a
saved `skill_status` ref. Package/agent versions need no change for this option.

Every accepted new save increments revision. An exact retry of the latest command
acknowledges its revision without rewriting; differing reuse is409. After another
save, an older revision conflicts and cannot undo it. This is bounded latest-save
recovery, not a permanent action ledger. Retry the original request/body when
uncertain, then refresh current layout. Never automatically rebase a stale draft.
New selections must exist at Save; already saved missing refs may remain. Cancel
is local and the draft does not change during fleet polls.
