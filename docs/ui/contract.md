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
