# Shared Playbook

The public `/playbook` page on a TinyWarden installation demonstrates the same
components and styles used by the application. It uses static sample data.
Shared source lives in [components/playbook](../../components/playbook).

## Required UI reference check

Before editing UI, identify the accepted component, variant, relevant states and
shared implementation. Review the complete composition: UI scope, card body/footer,
padding, typography, icons, controls and responsive behavior. Reuse the shared
component; feature CSS owns placement and geometry. Add reusable missing variants
to the shared library and gallery.

Compare the rendered result with the accepted reference on desktop and mobile.
Action menus can refresh an unavailable read on opening. Keep a labelled retry
entry when the read fails; reposition the open popover when refreshed items arrive.
Dialog utility layout must preserve the shared text button's horizontal padding;
use block-only padding when adjusting its vertical spacing.
Check relevant empty, one/multiple-row, loading, error and open-dialog states,
keyboard focus and touch behavior. Retain screenshots and state evidence for review.
Resolve visible differences before accepting the change. Build success and absence
of overflow alone do not establish visual fidelity.

## Component ownership

| Need | Shared implementation |
| --- | --- |
| Buttons and icons | `PlaybookButton`, `PlaybookIcon` |
| Primary status | `StatePill` |
| Subordinate row/list status | `RowStatus` |
| Value and context label | `ContextValue` |
| Facts | `FactGrid` |
| Compact label/value results | `FactRows` |
| Single-server action progress | `ActionProgressDialog` |
| Agent action readiness | `MaintenanceReadiness` with shared labelled/stacked `DataTable` and `RowStatus` |
| Pagination in a card | `CardPagination` or canonical padded body/footer |
| Skill settings actions | `SettingsFooter` |
| Resource selection | Shared resource selector and filters |

Primary screen and section statuses use boxed pills. Secondary statuses in rows
and lists use text status with a cue. Preserve visible words and supplied status
semantics; never infer health from a translated label or package identity.

Agent maintenance notices beside dashboard server names use the existing compact
maintenance pill, including its explanatory tooltip. Group the name and notice
with `tw-host-heading` so the shared gap and wrapping keep them separate in both
table rows and cards. The server's health and connection statuses stay distinct.

Settled skill receipts may provide an explicit icon-button dismissal beside View
result; the Management example demonstrates this variant. Keep it absent for running,
approval and verification states. Account display preferences never change work or
remove Recent results access. The receipt divider belongs to the full-width card
wrapper, with padding on its contents. Inline icon/text utilities use a shared gap.

## Layout and tables

`ActionProgressDialog` uses the accepted compact action layout: a stable action
title/server, primary status, quiet status message, labelled `FactRows` and a
rightmost Close button. Its compact footer combines saved-activity context and Troubleshooting.
Approval risk remains visible beside the approval controls. Cancellation and recovery confirmations stay inside this same shell.
`SettingsDialog` owns its own `.tw-ui` scope so callers outside a Playbook root
receive the complete dialog styling. Its scope wrapper uses `display: contents`
to avoid adding space to the caller’s layout. Browser checks must include an unscoped
server-page caller; a globally scoped gallery alone cannot prove that integration.
`SettingsDialog.open` hides/reopens the native dialog while its owning command
controller remains mounted; background reads never advance its `step` key. The
Management maintenance example demonstrates running/completed values and reopening.
Keep the title, server and controls stable during startup and ordinary polling.
Fit the body to its current content instead of reserving empty status/result space;
explicitly opened diagnostics can grow in the scrollable body. Compare the whole
delayed interaction sequence, not only each individual status screenshot.

Use the shared 1440px content maximum and 320px desktop sidebars. Dashboard section
numbers sit outside the content boundary when there is room and move above the
panel at narrower widths. Reuse layout tokens and responsive rules.

Tables size columns from their headings and values. Allow heading word wraps and
avoid fixed widths based on skill or value type. First columns align left, interior
columns center and last columns right, including headers; a lone column stays left.
Keep grouped values together. Stacked mobile values align left, and wide data
stays inside its table scroller.

## Current compositions

| Composition | Source/reference |
| --- | --- |
| Tokens and shared geometry | [tokens.css](../../components/playbook/tokens.css) and owning layout styles |
| Status, facts and context values | [data.tsx](../../components/playbook/data.tsx) |
| Buttons and controls | [controls.tsx](../../components/playbook/controls.tsx) |
| Resource filtering and selection | [resource-filters.tsx](../../components/playbook/resource-filters.tsx), [resource-selector.tsx](../../components/playbook/resource-selector.tsx) |
| Settings footer and skill composition | [skill.tsx](../../components/playbook/skill.tsx) |
| Pagination | [pagination.tsx](../../components/playbook/pagination.tsx) |
| Public gallery | [page.tsx](../../components/playbook/page.tsx) at `/playbook` |

Resource selectors use search, Show all states, Monitored only and state tabs.
They do not add a second States dropdown. Filter changes never enable/disable
monitoring. Selected unavailable resources retain their explanation/removal action.

ContextValue keeps the primary datum and its context legible (for example a
filesystem percentage with mount label). Use supplied semantic tones: no reboot
request is healthy; a requested reboot is warning. Color supplements visible
words/cues and does not redefine severity. Compact times preserve a full instant.

The management gallery uses the shared stacked table with the `tw-table--selection`
variant on mobile. It keeps the selection checkbox beside the first value,
preserving whole resource names alongside lifecycle and action controls.

Every shared variant needs a matching gallery example. Keep pagination inside its
canonical container and retain the [ESLint guard](../../scripts/eslint-playbook.mjs).
Do not add explanatory page-footers or implementation prose merely because a
component has a footer slot; that slot owns appropriate actions/pagination.

Record viewport, state, data volume, focus and actual shared variant when comparing.
Check page overflow, contained table scrolling, long labels, cues and dialog/popover
positioning. Update [copy and formatting](localization.md) with wording changes.

Use `tw-table--stack tw-table--labelled` when mobile values need their column
labels (for example current/requested versions). This opt-in variant stacks cells
in one column and shows their `data-col` headings below the identifying value.
The Management gallery includes ready/unavailable examples. Keep status words
short; put a long explanation in normal wrapping secondary text.

Action readiness also distinguishes **Skill update required** for a retired
verification policy. Reuse the same `MaintenanceReadiness` table and off-tone
`RowStatus`; explain the required skill-author update in secondary text. A missing
agent report keeps its separate Unknown explanation.

Fleet action menus use the shared ActionMenu with eligible items only. A partial
selection adds a count to its action label. Confirmations reuse the labelled,
stacked DataTable and RowStatus to name affected and skipped targets. Disabled
form controls may still indicate temporary loading/submission; unavailable actions
are omitted from the menu. The Management gallery demonstrates a paused server's
applicable Resume action. Eligibility is domain policy, not component CSS.


### Advancing reviews and maintenance examples

Fleet keeps app management controls in ActionMenu and exposes one **Skill actions…**
entry for available package actions. `separatorBefore` and `next` provide shared
menu grouping/directional cues; callbacks receive the originating trigger for focus
restoration. Keep the existing synchronous popover positioning and keyboard handling.

`components/skills/action-picker.tsx` supplies the shared inert grouped choices.
Combine it with FleetDialog/SettingsDialog and the canonical body/footer. The
`tw-list--choices` variant uses whole-row buttons, wrapping names/help and shared
directional icons. Groups/actions are supplied data, not package-specific renderers.
Opening/advancing focuses the heading; closing restores the originating menu trigger.
An ordinary refresh keeps focus, while removal of the focused last item focuses
the heading. Failed/stale reads suppress selection and an emptied picker names its
empty state. The Management gallery includes one/multiple groups, partial targets,
empty and long-label examples. Compare desktop1440/mobile390 and contained scrolling.

`SettingsDialog` accepts an optional `step` key for a review that advances inside
one modal. A step change focuses its heading; ordinary polling preserves focus.
Its `size="wide"` variant provides a 1000px maximum for multi-column reviews,
bounded by the same viewport padding as the default dialog. Do not assign widths
from a skill identity. The maintenance gallery demonstrates both review and
approval, using sample data without executing actions.

Combine `tw-table--selection` and `tw-table--labelled` for selectable mobile rows
with labelled facts. The utility checkbox stays beside the identifying value;
remaining labelled values occupy the second grid column. Use `tw-seg--scroll`
for many review tabs so they remain one contained horizontal strip.

`StatePill` accepts an explicit `value` for a primary status whose visible words
differ from its semantic tone. Informational progress has the boxed violet variant;
subordinate table phases still use `RowStatus`. Keep action consent, result effects
and recovery instructions in normal wrapping text. Put dialog actions in the
shared footer; long plans and diagnostics remain in the scrollable body.

Bulk maintenance progress rows use a **Result** button to advance to a full-width result
inside the same wide dialog. Keep result facts outside table cells, with the same
heading focus and Back action as other advancing reviews. Omit selection/plan
columns when they have no content. Show the preparation hint only while work is
active. For results reporting no package changes, omit null post-install facts;
preserve known values and explicit unknowns for changed/uncertain/running native
transactions. The maintenance gallery includes the failed-preparation result view.

`DataTable.emptyState` can supply a contextual `WidgetState` with a custom `title`
and description while retaining the shared empty-row frame. Review tables name the
selected table (for example “Packages to upgrade: none”); monitoring tables keep
their default readings message. The maintenance gallery includes the empty review.
Package action results omit missing facts before an apply attempt, while retaining
known zero/false values. Started, running or uncertain work keeps unknown facts.
A no-change result's matching `outcome` fact uses the shared phase label; other
skill text is displayed literally.

The maintenance gallery also reuses the server Agent details readiness section.
Action names identify rows; subordinate readiness states include a wrapping
explanation. Show only verified missing packages below the table. Stale or failed
reads hide package advice. Use the same composition for future registered actions.


### Single-server actions

A parameterless action starts preparation directly from its row picker.
Use the standard-size SettingsDialog, a primary StatePill, the server label and
shared typed result facts. Avoid bulk counts, target checkboxes and plan tables in
this progress view. Render approval review inline in the same shell; retain input and bulk target review.
Use compact ActionActivity beside the Fleet action menu, with View progress;
keep the busy explanation in the menu, outside the health cell.
include the same entry in its row ActionMenu. Progress must reopen from server data
after reload. Hide cancellation after the one-server execution has started.
Preserve the same recovery eligibility in compact and bulk progress. Delivered
work waiting for cancellation or expiry acknowledgement must retain access to the
existing read-only recovery step even before an attention flag is set.

Approval progress uses `ActionProgressDialog` with its shared `approval`, `review`,
`footerNotice` and `primaryAction` slots. The review variant uses a content-sized, scrollable
body and a stable footer notice/action area. Clamp the open dialog to the viewport;
the body shrinks and scrolls while its header and footer stay visible. A settled
result keeps one Saved in Activity/Close row and omits the redundant footer notice.
Use standard dialog body typography (13.5px), compact 13px FactRows and the standard
13px table text. Text values use the normal font; typed numeric values retain their
monospace formatting. Use the shared
labelled stacked DataTable for long mobile versions, exact-plan approval and
quiet background reads. Retain accessible pagination. Current action reviews show only the owning skill's
facts and tables; historical whole-host coverage remains readable only on old records. Keep the saved skill description visible in inline approval review.
Same-page revalidation preserves pagination focus and controls; requested page/table
loads and unusable reads retain their loading and approval safeguards.
Single-host review omits selection/order counters. The Management
gallery includes preparation, inline approval, application and completion.

`ActionOperationLog` uses the shared `OperationLogPanel` and `ActionLogView`.
The Full transcript variant starts collapsed, including on failure, preserves user
disclosure choices across quiet reads and phase changes, and offers explicit Copy
and Download when opened. Collapsed logs do not fetch transcript contents.
Captured command, native output, exit and runtime text form one wrapping monospace
stream; historical events-only records clearly identify missing command output.
Use the existing dialog body as the scroller. Keep the disclosure, export controls,
Captured output/truncation context and live indicator compact and stable. The
Management gallery uses this same panel. Diagnostic text stays subordinate to
the primary outcome and never supplies execution authority.

### Server skill operations

Use `SkillOperations` with the shared `ActionMenu` in the `SkillFrame` header's
control group: **Check now → Operations → Settings**. Reuse the secondary small
button, dropdown chevron, native popover positioning and keyboard behavior. Menu
labels come from the skill catalogue and wrap without fixed skill-specific widths.
Omit Operations when no action is eligible. Keep `ActionActivity` and its View
progress / Verify and unlock link in the same header control area; Fleet keeps its
compact activity beside its row menu. The Management gallery demonstrates this
header composition. Do not add a separate row of action buttons below the header.

The shared launch controller preserves one-server scope, inputs, exact approval,
uncertain retries and reopening. Fleet keeps health/lifecycle and operation progress
separate, with edge alignment on desktop and left-aligned labelled values on mobile.

For server skill cards, place `ActionActivity`'s receipt variant in the shared
`SkillFrame.activity` slot beneath the header content. The receipt shows the action
name, a subordinate `RowStatus`, completion time and the state-appropriate View
progress / Review plan / View result / Verify and unlock link. Keep the header's
Check now → Operations → Settings group intact. Operations includes Recent results
even when no command can run. Use the shared SettingsDialog and receipt list with
cursor pagination for history. The Management gallery includes a completed receipt.
Settled action dialogs use Saved result context and normal-sized completion time;
server-scoped dialogs offer Recent results in the existing footer. Logs stay
collapsed. Preserve the original title, exact job scope and approval/recovery gates.

### Full execution transcript

Use the shared Execution log frame and `ActionLogView` for every skill. The selected
Full transcript variant shows one wrapping monospace stream with command, native
stdout/stderr, exit and runtime-error text. Keep actual output literal, not a
synthetic stage table. Copy/Download export all retained text. The header/footer,
normal body and visible Close remain stable during polling; no automatic control
locking. Keep long output in the dialog's existing body scroller. Inherited native
output and explicit SDK text use the same renderer, including an unrelated skill.

Old events-only records explicitly state that command output was not captured.
Never reconstruct a CLI error from a status label. Show a supplied truncation
notice. Compare command failure, command success plus runtime failure, running,
completed, long/truncated and historical output at desktop/mobile, including an
unscoped server-page caller. The Management maintenance gallery uses this variant.

### Verification-required operation activity

Reuse `ActionActivity`'s verification variant for both Fleet rows and skill cards:
warning text **Verification required**, book icon and **Verify and unlock**. Active
work retains its action name and View progress. Menu wording uses the same generic
terminal-state predicate. The Management gallery includes the shared variant.

The direct entry opens the existing exact-job recovery form in the foreground of
`ActionProgressDialog`, using normal body typography/spacing and a visible Back/
Close path. Keep its action title/server stable. Existing authorization/CLI steps
stay explicit; no action occurs on open/reopen or quiet polling. Do not hide this
primary recovery path under Troubleshooting. Long code wraps inside the same body
scroller; keep the footer visible on desktop and mobile.

New action review screens omit whole-host baseline tables and coverage warnings.
Use the owning descriptor’s facts/tables, with its complete wrapping description
beside approval. Reviews with no declared tables show facts/description directly.
Historical coverage tables remain available only on historical plans.
