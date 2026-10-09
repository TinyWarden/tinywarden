# UI contract

The authenticated app has Servers, Skills and History sections, plus a server
detail page. Anonymous entry opens the local-administrator sign-in form directly;
there is no welcome page, email sign-in, remembered-login option or email reset.

## Shared presentation

Use the existing 1240px content width, responsive layouts, locally served fonts,
brand mark and Warden mascot. Mascot and attention colors follow the highest
current severity: critical, warning, unknown/stale, healthy. Status meaning must
also be conveyed by text/icons, not color alone. Attention badges persist across
sections; title and favicon counts derive from the same current fleet rollup.

Owned headings, labels, errors, metadata and accessible names come from
`messages/en.json` through the typed message boundary. Do not embed display text
in components or turn untrusted content into HTML. See [localization](localization.md).

## Servers and detail

The dashboard preserves enrollment controls, contact and severity groups, skill
chips and server links. Use singular/plural copy for counts. Keep Updated and
Refresh together with the separating dot. Each skill reports independently;
do not imply every check runs with each heartbeat. The changes sidebar is shown
only when changes exist in the last 24 hours; its "Since midnight" count uses the
history clock. Clean limited checks can pass without claiming overall patch/reboot
assurance. A reboot request cannot appear in Healthy.

The detail page shows collected contact/system facts, current skill results and
reading history. Configuration editors preserve per-field inheritance and explicit
custom values, including values equal to the current default. Save is labeled
"Save", independent of hostname length. Stored revision identity serves concurrency
and historical interpretation; it is not a rollback control. Disabled or expired
readings cannot supply current healthy facts.

## Skills and history

Show only the four installed skills and verified Debian 13 compatibility. Global
On/Off saves independently from defaults. Show pending/error states; global Off
removes current attention without deleting history. Per-server overrides stay on
the server page. Saved dates/revisions come from real records. Show "Show more"
only when content actually overflows the collapsed area.

The OS filter uses a bordered popup trigger, release search, family headings and
real compatible-skill counts. Usage instructions use a book icon, step count and
right-aligned Show/Hide; do not repeat skill cadence in this bar.
Add skill lives in the catalog footer and opens a ZIP upload dialog. Keep the
chosen file on close, preserve failures, and block dismissal while upload outcome
is pending or uncertain. Installation remains off until exact access is approved.
Default inheritance help follows the agent-delivery note below the editor.

Use Official for trusted first-party artifacts and Community for other uploads,
based on the stored artifact flag, never its self-declared publisher name. Show
publisher/license alongside this badge directly beneath the skill title. Display requested server access as readable
operations with exact paths, command alternatives, properties and limits. Package
fingerprints belong under Technical details. ZIP uploads for an existing skill
open its exact access/version review in the same modal; Update skill confirms
selection, preserves compatible settings and On/Off state, then refreshes the
header. No Installed versions section or Reload list control is displayed.
Closing a review leaves the current version active; re-upload resumes it.
Uncertain updates retain the exact approval request and block dismissal until
resolved, even if refreshed data already shows the requested version selected.

History filters support multi-select servers and skills, time range and state.
Filters change protected reads without resetting unrelated dropdown state.
Loading, empty, unavailable, capture-gap and expired states remain explicit.
See [change history](../architecture/change-history.md) for cursor/filter bounds.

## Interaction and accessibility

Use semantic landmarks, headings, links and buttons; label all controls. Dialogs
have accessible names, focus placement/restoration, Escape/close behavior and
keyboard reachability. Multi-select controls expose selected state. Announce
validation/save errors, preserve user input on failure and prevent duplicate
submissions without hiding outcome uncertainty. Respect reduced motion, keep
contrast and focus indicators visible and support narrow screens without losing
controls or table meaning. Desktop and mobile layouts preserve the same functions.

## Skill data displays

The [shared Playbook](playbook.md) owns reusable widget styling and source examples.
Packages bind facts to app-owned components with the [Display API](../architecture/skill-display.md);
no uploaded markup or per-skill rendering hooks are supported. Historical views
use original settings and package metadata. New package graphs begin with new
readings; gaps and missing evidence never become zero or current healthy data.
