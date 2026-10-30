# Monitoring, configuration and current health

The [user skill guide](../using/skills.md) explains the five official skills.
New monitoring behavior uses the [skill author journey](../build-skills/README.md).
This reference covers the shared platform policy around a package.

## Installation and enablement

Admission verifies archive/content identity, supported contract, metadata and
declared capabilities. Installation starts disabled; uploading another version
does not select it. Selecting a digest requires its exact access review. Current
updates require compatible settings schemas instead of guessing a migration.

Global enablement controls whether new assignments are issued. Server policy
cannot enable a globally disabled skill. Off removes the skill from current
attention and scheduling; retained readings do not become current again when it
is switched back on. The new context needs fresh evidence.

## Defaults and overrides

Defaults are installation-wide. Each server stores explicit customized-field
intent, rather than comparing its values to the current default on every read.
An inherited field follows later defaults. A saved custom field remains custom
even if its value equals the default. Reset clears the relevant custom intent;
saving a different field must not pin every inherited value accidentally.

The server merges current defaults and overrides and validates the complete tuple
under the mutation locks. A proposed default that would invalidate an inheriting
server policy is atomically rejected with `default_override_conflict`, not clamped.
Requests carry expected revision/enablement/policy counters and exact-retry IDs;
stale edits require a refetch. A no-op does not advance counters or repin assignments.

SDK 2 resource selection is per host and independent of scalar inheritance.
Global defaults and Use global defaults do not select resources across hosts.
Adding/removing a selected key changes that membership epoch without restarting
unrelated targets. See [resources](skills/resources.md).

## Independent dimensions

| Dimension | Question |
| --- | --- |
| Contact | Has the current enrolled credential recently completed accepted communication? |
| Applicability | Does this host/runtime support the selected package contract and declared platform? |
| Enablement | Is collection allowed by global/server policy? |
| Fleet control | Is the host Active, and has the capable agent applied its current monitoring epoch? |
| Maintenance | Should current health/contact notification attempts be suppressed during this window? |
| Freshness/context | Is there unexpired accepted evidence for the current assignment context? |
| Health | What does that evidence establish within the skill's declared scope? |

Pure evaluation returns healthy, warning, critical or unknown. The platform adds
unavailable/disabled/stale/not-configured presentation where execution or evidence
does not support a current result. Missing evidence never implies healthy and a
server's successful heartbeat never establishes that its selected service runs.

Pause applies above every skill and collection lane. It stops fresh authority,
invalidates old monitoring contexts and waits for a capable agent's quiescent
acknowledgement; heartbeat and managed updates continue. Resume needs fresh
assignments/evidence rather than reusing a pre-pause assessment as current.
Maintenance keeps collection running. Archive revokes agent authority while
retaining configuration/history under the retention policy. These controls do not
change a skill's enablement, settings or selected resources. See
[Fleet control](fleet-management.md) for leases, replay and late-result rules.

SDK 2 evaluates selected targets independently. The aggregate precedence is
critical, warning, unknown, healthy; empty selection is Not configured. A failing
resource remains actionable when another target is unreadable. Removing selection
ends monitoring rather than proving physical recovery. History/notifications use
per-resource identities and the same stored evidence.

## Display and manual collection

Descriptors bind typed facts/rows/metrics to shared widgets. Dashboard field IDs,
names, formats and tones are declared metadata, not widths or arbitrary HTML/CSS.
Settings pages and tables must work for a compatible third-party package with no
app branch. See [display](skills/display.md) and the
[Playbook](../contributing/playbook.md).

Refresh page reads stored data. A manual run requests actual collection through the
agent, subject to support, contact, scope and queue/deadline limits. Resource refresh
requests discovery without adding selected targets. Neither action grants extra
host access. Status remains queued/running until the bounded lifecycle produces a
result or explicit failure; see [manual protocol](agent-protocol.md#manual-requests).
The UI calls these states Waiting for agent and Checking… and polls pending
progress every two seconds while visible. Agent 0.0.27+ optionally waits for
monitoring hints independently of scheduled discovery. This transport optimization
applies to every compatible monitoring package without new skill APIs or hooks.

## Source

[Package controls](../../server/skills/catalog/package-controls.ts),
[defaults](../../server/skills/settings/package-defaults.ts),
[policies](../../server/skills/settings/package-policies.ts),
[overrides](../../server/skills/settings/field-overrides.ts),
[projections](../../server/skills/results/package-projection.ts) and
[resource projection](../../server/skills/resources/projection.ts) own these rules.
