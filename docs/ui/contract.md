# UI contract

The public entry is an honest informational surface: no fake hosts, charts, totals
or unwired operational controls. The guarded P1.C fleet reads authoritative contact
state from the application database.

Use system sans-serif typography and semantic CSS tokens in `app/globals.css`.
The current palette is neutral with restrained green emphasis. Use shared shadcn
primitives from `components/ui`, not feature-local replacements. Card and Badge
are the initial owned primitives; future controls are added when a workflow needs them.
Do not add a table engine until list behavior justifies it.

Keep one main landmark and one page heading. Include a keyboard-visible skip link,
semantic links, visible focus and named controls. Status must be readable without
color. Fit actual container width, including narrow panes; constrain overflow to
the relevant accessible region. No external fonts, analytics or tracking assets.

Use the English catalog contract for all copy. Future workflows must define loading,
empty, unavailable, permission-denied, validation, saving and conflict states.
Save establishes a baseline; cancel exits; discard restores the saved baseline.
Do not silently lose edits or let an older response replace newer input.

P1 [contact states](../architecture/agent-protocol.md#contact-state-and-operator-view)
own current/stale/unknown/revoked labels and refresh behavior. They describe contact;
health remains unknown before checks. Read failure is unavailable. Render those
distinctions through catalogs without relying on color or stale current badges.

Future overlays must escape clipping parents and preserve focus/keyboard semantics.
Use shared tooltips instead of native title attributes. Searchable vs short static
dropdown patterns are adopted only when required by actual product controls.

## Check policy editing

P2.A adds one global disk-default form from the fleet view and a host policy form
on host detail. Use inline labeled controls and existing shared primitives.
The [definition contract](../architecture/check-definitions.md) owns permissions,
values, optimistic preconditions and saved outcomes. The forms use catalog-backed
inline controls and keep unsaved drafts visible through conflicts.

Show warning/critical percentages and interval (explicit seconds), current saved
revision and all-local-filesystems coverage. A short radio choice selects global
inheritance or a complete host override; inherited effective values are readable,
not editable. Switching to override initializes a draft from effective values.
Switching to global inheritance is a draft until Save; Cancel/Discard restores the
saved mode and values. Preserve a dirty draft across background refreshes and
confirm discarding it on navigation. No autosave or mutation on selection/load.

Use one request ID for an uncertain Save retry; changed input gets a new ID only
after resolving the prior outcome. Saving disables duplicate submission. Conflict
preserves the draft, shows the newly saved baseline and requires explicit review
before resubmission. Read failure is unavailable, never an empty/defaulted success.
Save success followed by refresh failure states both outcomes accurately. Older
responses cannot overwrite a newer draft or revision. Permission loss disables
editing without falsely declaring success.

Distinguish saved desired values from last delivered revision and eventual observed
health. A saved edit does not claim the agent received it. Explain unsupported/
missing capability and not-yet-delivered states. Catalog all text, accessible names,
units, reason codes and feedback in English; never expose raw server errors.
Required focused verification covers keyboard, focus/error association and narrow
layout through the complete global/override/reset/conflict workflow.

## Disk observation detail

P2.B host detail shows current disk health separately from P1 contact and from
saved or delivered policy. A first host, obsolete assignment, incomplete run,
unsupported collector, uncertain clock or stale observation cannot receive a
healthy badge. Show a catalog-backed reason and the last five immutable received
runs with their snapshot provenance, thresholds, coverage, exclusions, drop count
and mount details. Read-only mounts are informational; shared capacity is marked
without adding capacities. Render a known warning or critical mount even when
overall coverage is unknown. Mount paths are protected host metadata and appear
only on the authenticated host page. Current classification uses exact integers;
rounded display percentages do not change it. History remains on the original
snapshot after a default or host override edit. A read failure says unavailable,
never empty or healthy. P2.C adds outage and update-delivery UI proof.

## Baseline observations and settings

P3.C presents package-plan, package reboot-marker and fstrim scheduling/service
cards separately. Show scoped interpretation, bounded typed execution outcomes,
recipe/normalizer/evaluator versions, saved/delivered source provenance and five
recent immutable runs per key. Never render raw command output. Unknown package
freshness or trim history does not hide a known package-marker warning. A latest
warning remains visible as historical attention when current authority/contact or
time becomes unknown. History continues using its original snapshot.

Poll every 30 seconds and on return to a visible document. Current healthy/warning
badges expire at the server's earliest `valid_until`, subtracting request duration
and elapsed monotonic time; failed reads also mark the captured view outdated.
Permission loss hides health/editors and offers sign-in. Initial read failure is
unavailable, not an empty or healthy result.

Shared Field/Input/ToggleGroup/Button controls edit global defaults or complete
host overrides. Native radio semantics choose inheritance, supported APT mode
and overrides; whole-second interval/budget bounds and associated errors are
catalog-backed. Save is explicit, optimistic, idempotent and audited. A conflict
preserves the draft and requires review of the new saved revision. Uncertain Save
blocks editing until the exact request is retried; save followed by failed refresh
reports both outcomes. Explicit refresh preserves dirty drafts; navigation/discard
requires confirmation. Saved, effective and last-delivered values stay distinct.
Keyboard focus, field-error association, desktop/narrow width, zero page errors
and the above retry/conflict/expiry/permission states were browser-checked in a
reserved synthetic preview, independently of live activation.
