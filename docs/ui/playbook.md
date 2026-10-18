# Shared Playbook and skill widgets

Open `/playbook` on your TinyWarden installation. It is public, uses static sample
data and imports the same React components and styles as server skill results.
Copy reports success only after the browser accepts the clipboard write. Examples
are visual guidance, not extra app features or access granted to a skill.

The resource selector below shares the app’s canonical controls and is demonstrated
on `/playbook#resource-selection`.

## Resource selection and monitoring

Status: implemented and visually accepted, 2026-10-17; live app gallery available.
The component belongs to the
[resource platform](../architecture/skill-resources.md) and
[Services skill](../architecture/services-skill.md) work. The shared example and state fixtures were built before connecting consumers. Do not start a separate
Services design system or add a package-specific UI renderer.

| Composition | Existing reference / implementation | Use |
| --- | --- | --- |
| Server skill frame | `tw-card`, `tw-skill`, shared `skill.tsx` frame | One Services card, standard header/body/details/history, no empty body row. |
| Resource selector dialog | `SettingsDialog`, canonical dialog head/body/footer | Manage services; bounded desktop width and full usable mobile width. |
| Search and filters | `tw-field`, `tw-input`, shared segmented controls | Search by name/description; All and Monitored with accurate counts. |
| Selection | Native checkbox with `tw-check` | Monitor column, accessible name includes service, draft/save semantics. |
| Table | Comfortable `tw-table` with responsive stacking and existing machine/text cells | Service grows; State/Monitor have bounded widths; no unheaded column. |
| Status | Shared pills/text and `WidgetState` | Running/Stopped/Failed/Checking/Unknown and neutral Not configured; labels never depend on color alone. |
| Actions | Buttons 4.1, `PlaybookButton` + `PlaybookIcon` | Manage/Refresh/Save use canonical icons; disabled unchanged Save has no explanatory filler. |
| Pagination | 7.2 `Pagination`, inside canonical dialog footer/body or `CardPagination` in a card | Ten rows; real range/total; hide on empty, single-page range only. |
| Help | 4.5 `FieldHelp` | Startup state, eligibility, alert delay and sampled-state explanation. |
| Actionable feedback | `InlineAlert`, `EmptyState`, table state rows | Partial/stale inventory, conflict, refresh failure, no services selected. |
| History | Existing event presentation and compact collection log | Show resource name within the existing hierarchy; no duplicate aggregate incident. |

Use one app-owned resource table/selector implementation under `components/skills/`
composed from shared controls. Put reusable visual variants in `components/playbook/`
and demonstrate them on `/playbook`; feature CSS owns column/placement geometry
only. The generic result table may reuse `DataTable` where its read-only contract
fits; do not force editing controls into package-supplied display facts.

Desktop: keep the 1240px page content edge, 320px master sidebar where applicable,
and standard card gutters. Service names and descriptions wrap; action/status
columns stay balanced. Mobile: stack rows with visible labels, keep each checkbox
beside its service identity, wrap the toolbar, and allow dialog body scrolling with
reachable footer actions. No page-wide horizontal scrollbar or clipped tooltip.

Interaction acceptance covers keyboard tab/Space, visible focus, Escape and focus
return, touch help, unsaved navigation/close protection, exact uncertain retry,
concurrent edits, refresh while dirty, search/filter/page changes preserving draft
selection, missing selected targets, and a read-only user's lack of mutation controls.
Use the existing Run now command lifecycle for queued/running/accepted-result states.

Required rendered reference cases: first load, no inventory, no selection, one row,
more than ten rows, search with no match, all monitored, mixed states, pending grace,
missing service, stale/partial inventory, unsupported runtime/type, maximum selection,
long escaped unit names, save conflict, refresh failure, unchanged Save and open help.
Check at 1440, 1198, 960, 959, 390 and 320px and inspect actual screenshots against
the accepted reference. Geometry and console tests alone are not visual acceptance.

The UI batch removes the three owner-marked explanatory footer/paragraph
sections on Dashboard, History and Skills, as listed in the Services design. Detailed
contracts stay in documentation; active error/warning messages remain contextual.

## Source and styling

`components/playbook/tokens.css` owns the colors, typography and spacing from the
accepted Playbook. `components.css` imports its component modules and the small
widget integration stylesheet. Fonts are served locally from `public/fonts`.
`components/operator/tokens.css` contains compatibility aliases for older pages;
do not copy a second palette into a feature.
Compatibility resets must have lower specificity than Playbook controls. They
must preserve the shared link colours, keyboard focus rings, disabled states and
the decimal markers of ordered `tw-steps` lists.

Use `tw-*` classes. Canonical component selectors are scoped to `.tw-ui`, so
existing unrelated page classes do not accidentally acquire a second style.
Wrap new shared component consumers in `className="tw-ui"`; the app imports the
styles once from `app/globals.css`. `.tw-app`/`.tw-root` provides the shared tokens.
Keep the app's 1240px content width and use catalog text for labels.

Server skill cards use the shared `tw-card` and `tw-skill` frame, its title,
full-width summary, body and disclosure classes, with `StatePill` for sampled
skill health. Settings in the header opens the shared dialog. Its fields show
the effective default until customized; closing protects unsaved changes, and
the existing save and concurrency rules still apply.
Their surrounding layout must consume the Playbook just as their tables, meters
and charts do. A section with one visible widget displays one heading. Resolve
package ownership before showing legacy cards, so initial reads
do not switch between two different layouts.

| Import under `components/playbook/` | Components |
| --- | --- |
| `field-help.tsx` | `FieldHelp`: Playbook 4.5 label help, mouse hover, keyboard focus/Escape and touch. Tooltips escape card clipping and stay within the viewport. |
| `forms.tsx` | `DisabledAction`, `InlineAlert`, `RequirementList`: existing disabled reasons, context alerts and live requirement rows. |
| `controls.tsx` | `PlaybookButton` (primary, secondary, danger), `StatePill`, `WidgetState`, `EmptyState`. |
| `page.tsx` | `PageHeader`: canonical page title, lead description, optional metadata and actions. |
| `choice-cards.tsx` | `ChoiceCards`: 6.14 exclusive radiogroup, keyboard arrows/Home/End, selected dot/edge and saved In use tag. |
| `account-menu.tsx` | `AccountMenu`: 12.2 name/chevron trigger, icon menu, current-page styling and separate Sign out footer; shared by every operator header. |
| `skill.tsx` | Shared card/frame, `Disclosure` (caret or plain icon/Show), `SettingsDialog` and `PlaybookIcon`. |
| `data.tsx` | `FactGrid`, `DataTable`, snapshot `BarChart`. |
| `series-picker.tsx` | `SeriesPicker`: 8.3 variant C, a chart-header menu with latest value trails, label search above eight choices and keyboard navigation. |
| `metric-figure.tsx` | `ChartFrame`, `MetricFigure`: shared chart header and metric readings, also usable with a series picker. |
| `meter.tsx` | `UsageMeter`, with explicit range, sampled status and optional thresholds. |
| `gauge-donut.tsx` | `Gauge`, `Donut` with accessible values and legends. |
| `chart.tsx` | `ReadingChart` (line, bar, sparkline), min/max envelope and pointer/keyboard point inspection. |
| `history.tsx` | `HistoryRange`, `CollectionLog`: compact Time / Result / Note log. |
| `pagination.tsx` | `Pagination` / `HistoryNavigation`; `CardPagination` adds the canonical card footer. First/previous/numbered/next/last pages and direct page entry. |
| `time-navigation.tsx` | Shared custom From/To and nearest-reading time jump popovers. |
| `chart-inspection.tsx` | Cursor, flipping tooltip and touch/narrow-screen readout. |
| `format.ts` | `valueText`, `numberText`, including exact integer byte formatting. |

Missing data is not zero. Use `WidgetState` for missing, empty, loading, error or
stale data. Sampled status supplies color; geometry does not determine health.
Provide a meaningful label, readable value and keyboard-accessible controls.
Fact grids fill the available width. Tables scroll within their card on narrow
screens. Count charts use whole-number axis labels and visible isolated points;
point color variants come from the shared component stylesheet. Charts retain peaks and gaps;
their point/bucket values are accessible by pointer or keyboard without a second
visible history list.

Line and history bar charts use the shared `tw-chart__frame`: a 120px plot with
HTML axis ticks at 10.5px, an SVG `viewBox="0 0 1000 100"` with
`preserveAspectRatio="none"`, and non-scaling strokes. HTML spans draw the fixed
6px isolated points and gap labels. Card width changes the plot geometry, while
text and stroke sizes stay constant. Use `ChartPlot`/`ReadingChart` instead of
putting axis text inside a scaled SVG. Segmented options use the shared compact
30px minimum height, or 36px for the block variant, and wrap on narrow screens.

## Skills page controls

Manage skills, Check for updates, Skill repositories and Upload skill all use
`PlaybookIcon` with the canonical button icon sizes and spacing. Card lists use
`CardPagination`: a `tw-card__foot` containing the shared `tw-pager`. A single page
shows its range only, multiple pages add navigation, and a loaded empty result
hides the pager. History and dialog consumers use their own canonical padded
containers with `Pagination`. Do not place a bare pager against a card edge.

The Skills page also consumes the shared components: Access to your server and
Technical details use `Disclosure`; Usage instructions uses its plain variant
with a book icon. Search, segmented filters, toggle, action buttons and the ZIP
dialog use canonical Playbook classes. Keep permission approval and upload locking
independent of these visual choices. An enablement review opens the access details
for review; disclosure buttons expose their expanded state and panel relationship.

## Page, metadata and empty-state composition

Use `PageHeader` from `page.tsx` for standard page titles. It composes the accepted
page heading with `tw-t-page`, `tw-t-lead`, optional metadata and actions. Main
containers using this heading receive the same header-to-content separation;
Skills, Manage skills, History, Settings and Change password share it. Dashboard
hero and server identity headers retain their own accepted variants.

The shared operator-header timestamp uses the latest reading's `as_of` value in
Europe/Bucharest. The visible label is **Bucharest**; formatters, date inputs and
calendar boundaries keep the IANA identifier `Europe/Bucharest`. Its hour/minute
separator blinks once per second with CSS opacity,
preserving layout and the complete accessible time label. Reduced motion keeps
the separator steady.

Use `EmptyState` from `controls.tsx` for an empty list or search result. It uses
`tw-empty`, its title and supporting text. Table loading/error/empty rows use
`tw-table__state` and `tw-table__empty`; omit body wrappers when there is no content.
Skill repository source and fingerprint belong inside Technical details, rendered
with `DetailsGrid`, rather than as a separate unstyled paragraph between disclosures.

Users & groups tables use the comfortable, responsive stacking variant. The User identity
uses `tw-t-head` for its display name and `tw-cell-machine` for the username and
email joined on one secondary line, wrapping when necessary. Without a display
name, the username is the primary identity and is not repeated below it. Role,
state and sign-in use text cells; counts use numeric cells. The **Servers** header
labels direct server assignments; group grants remain separate in the editor.
A column group gives the identity the remaining width and
bounds role/state/count/action columns; numeric headers and values align right.
Feature CSS controls only this column geometry. On narrow screens the shared
stacking table supplies labels and preserves Edit actions.

The accepted card body has no top padding because a preceding card header supplies
that space. For a headerless card, the shared integration adds the same 18px gutter
at the top as the body has at the bottom. Use the normal card/body composition;
do not patch the password form or other individual pages with padding overrides.

Dashboard healthy rows use the same native comfortable/stacking table and cell
styles, with a column group for bounded optional values and a flexible server
identity column. The shared `tw-table--sticky` variant pins the first column while
scrolling and releases it in the stacking layout. Its opaque cell backgrounds use
the canonical surface/hover colors. Meter table minimum widths apply only to tables
that do not use stacking; stacked meter cells can span their row without forcing
page overflow. Every column is rendered with a heading and a matching body cell.

## Required UI reference check

Before a UI edit, identify the accepted reference component, its state and the
shared implementation. For example: Buttons 4.1 → `PlaybookButton` / `PlaybookIcon`,
Pagination 7.2 → `Pagination`, Card 10.1 → `tw-card` / `tw-card__foot`.

Review the full composition: `.tw-ui` scope, card/body/footer, spacing, typography,
button size and icon policy. Feature styles contain layout rules; component visual
rules belong in the shared Playbook. A new component or visual variant must be
added to the shared implementation and documented here.

Acceptance requires comparing the rendered result with the accepted reference on
desktop and mobile. Check actual spacing and type, all related action icons, and
relevant states such as empty, one page, multiple pages, loading and dialog open.
Save screenshots and state checks. Resolve visible mismatches before marking the
change complete. Generic checks for overflow or console errors do not establish
Playbook fidelity.

ESLint's `playbook/card-pagination` rule rejects unpadded pagination inside cards,
including import aliases. It covers the reported composition mistake. Rendered
reference checks remain required for styles and composition across components.
Compatible with groups the operating-system family and version: Debian /13.
The standalone OS filter keeps its full Debian13 label for context.

## Community skills

Skills use the [Display API](../architecture/skill-display.md), **not React imports**.
Add `display.json` to the ZIP root and keep labels in `messages/en.json`. Declare
typed sources matching emitted facts and table columns, then select app-owned
widgets. HTML, CSS, JavaScript, SVG, executable templates and arbitrary URLs are
not accepted. The app renders and escapes data; the agent still collects it using
the existing SDK host operations.

For a table-cell usage bar, put a `meter` declaration on that table column. For
history, declare a `metrics` entry and reference it from `line_chart`, history
`bar_chart` or `sparkline`. A table metric requires a stable row identity and label.
The app records accepted numeric samples automatically; authors do not create
tables, write SQL or add endpoints. Reads use the protected
[history API](../architecture/skill-metric-history.md).

The [memory example](https://github.com/TinyWarden/tinywarden-agent/tree/main/skills/examples/memory-pressure)
includes a complete table, cell meter and real history chart. Follow the
[author walkthrough](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/authoring.md).
Old packages without a descriptor keep their fact/table view. Facts or columns
are shown only when explicitly selected by the descriptor; there is no automatic
leftover-facts dump under Details. Graphs begin
with captured readings and include compatible earlier package versions under
the [metric compatibility rules](../architecture/skill-metric-history.md).

## Shared card structure

Use Header → Current results → declared graphs → optional Details → History.
Details and History start closed. History has ten collections per page, a real
total, and the same 24 h / 7 d / 30 d / 90 d controls on every skill. Graph controls
mirror this shared range, including when it is changed inside History. Opening it
freezes graph/log bounds until Refresh, a range change or close; live status still
updates. Do not render old widgets for each reading or add a chart-reading list.
The public complete-skill example uses the same compact log components.

Community packages select `current`, `graph` and `details` roles in display format
2; the app always owns History and its controls. See the
[complete structure and API contract](../architecture/skill-widget-structure.md).

## Navigation and interaction

The accepted v1.2 Playbook adds `navigation.css`, scoped to `.tw-ui` like the other
canonical components. `/playbook#navigation` demonstrates the same controls with
static sample data. Every skill History uses the shared table/list, exact range,
numbered pages with ellipses and first/previous/next/last. A single page shows only
its range. Above seven pages, Go to page accepts a page directly; narrow cards
show Page N of M instead of the numbered list. Coarse pointers use 44px targets.

Custom opens a From/To popover in the displayed application timezone, including
a timezone suffix. UTC conversion rejects invalid dates and nonexistent daylight
saving times. Applied custom bounds synchronize graphs and History; the Range
chip restores the last preset. Jump to time finds the nearest retained collection
within the applied range, opens its page and highlights its row. Neither action
reconstructs a full historical widget. Dates remain subject to 90-day retention.

History starts collapsed and retains loaded rows during same-range refresh or a
failed page request. Range changes start at page one. Page navigation shares its
receipt watermark; current results remain live. Refresh includes newer arrivals.
Chart inspection uses the same tooltip for mouse/keyboard and a persistent narrow
readout for touch, with min/max/count for aggregated points. No second chart table.
Run now and Settings share the action row, with a reserved outcome line below it.
Completed requests clear that line; the header and History already show the reading.
Queued, running, failed and unavailable feedback stays visible when relevant.

## Playbook v1.5 account menu

The accepted 12.2 account menu uses `details.tw-account` and a 40px
`summary.tw-account__btn`: user-round at 18px, name at 14px/500 and a 16px
chevron. Its 220px popover is right-aligned, 8px below the trigger. Settings,
My account and Change password use 9.9 menu items with 16px icons; the current
page receives `aria-current="page"`. Sign out is alone in `tw-menu--foot` on
surface-2 and retains the guarded POST operation. No avatar, initials or extra
identity block is added. Long names are bounded visually; the accessible trigger
label contains the full name.

The shared component closes on outside click and Escape, returns focus to its
trigger, and supports keyboard movement between enabled menu items. Settings
remains admin-only; Change password remains available to local-password accounts.
Every Settings child route marks Settings current. My account and Change password
mark only their exact page. The `/playbook` gallery includes closed and open/current
examples of the same component. Shell styles must not override its typography or
popover geometry.

The v1.5 Page shell numbering is: Header bar 12.1, Account menu 12.2, Page header
12.3, Breadcrumb 12.4, Layout & responsive 12.5. This renumbering changes reference
numbers and does not change application routes.

## Playbook v1.3 series picker

The accepted visual reference moves Pagination to 7.2, Date/time navigation to
6.5, History to 10.7, Chart inspection to 8.2 and Run now to 10.6. Series picker
is 8.3. Source comments and the shared styling use those current numbers.
Colors, spacing and font files retain the existing canonical values.
`series-picker.css` contains the reference's A/B/C/D styling; C is the implemented
shared single-series menu. Other visual variants do not grant new comparison
behavior to packages. `/playbook` includes an interactive C example built from
exactly the same component as the app.

Table-backed skill charts use C in the chart header, never a full-width field
above it. Options match current table rows and sort alphabetically; the first
option is selected automatically. Each trail shows that row's latest formatted
metric value. The runtime labels the picker using the linked table's catalog
title (“Filesystems” for disk space); shared examples retain the general “Series”.
Search appears above eight options. Enter/Space selects; Up/Down,
Home/End, Escape and focus dismissal work without mouse input. The picker wraps
below the title in narrow chart cards. Stored history remains available for every
listed series through the existing authorized metric API.

Skills already declare the required table source, metric value, `series_key` and
`series_label`. No skill HTML, disk-specific renderer or new SDK/API field is
required for another skill using those same bindings.

Chart keyboard instructions use the Playbook `tw-sr` utility: they remain
available through `aria-describedby` without appearing inside the visible plot.

### Public UI alignment

Change history uses the shared filter triggers, popovers, segmented controls,
active filters, state pills, event rows, group headers, comparison panels and
load-more control. Its server/skill filters and cursor navigation retain their
existing behavior. The server skill picker and account menu use shared popover
and menu styles; login uses shared inputs and buttons. On narrow screens the
sign-in form follows the compact brand header immediately.

Dashboard section layout uses `tw-fleet-group` and `tw-fleet-gutter` for positioning.
Its counters consume canonical `tw-gutter`, `tw-gutter__n`, `tw-gutter__label` and
the numbered tone modifiers. Do not redefine those global Playbook selectors. The operator header is scoped to its app-shell child, and the dashboard hero
uses `tw-fleet-hero`, so neither can override gallery examples. Page-specific CSS owns layout, positioning and responsive composition,
while the Playbook owns each control's appearance.

## Account and sign-in surfaces

My account uses PageHeader, canonical card head/body/footer, ProfileFields with
`tw-field`/label/input/note, DetailsGrid and PlaybookButton/PlaybookIcon. Disconnect
uses SettingsDialog and canonical danger/secondary actions. Users & groups uses the same
profile fields in create/edit dialogs; its table keeps profile names/email together
and bounds the Sign-in column rather than inventing independently spaced cells.
Settings Sign-in follows the supplied v1.6 Settings/Playbook reference. Its method
card uses shared 6.14 ChoiceCards: Local accounts or Identity provider (OIDC).
Local hides all provider configuration, mappings and sessions. The Local card
contains the choice cards and Save footer; omit the redundant Accounts / Passwords /
Identity provider fact band, per the owner’s latest revision. Saved mode owns the
In use tag and sidebar meta; selecting a draft mode never changes those markers.
The method body uses the reference’s 12px compact form gap and no extra top padding.
A 4.1 warning explains the pending switch. Save becomes Switch to local accounts
or Switch to identity provider; missing issuer, Client ID or secret gets a reason,
while an unchanged disabled Save has none. Switching to Local preserves saved
provider fields/mappings, ignoring hidden draft changes.

Provider mode automatically creates a User after valid provider sign-in, per the
owner’s updated requirement. The reference’s optional account-creation checkbox is
therefore replaced with an informational 4.1 alert. There is no enable-provider
checkbox: the method choice is authoritative. Backend login/session checks enforce
the User restriction; enabled local Admins retain password fallback.
Settings Sign-in reuses SettingsShell and the same cards/fields/selects.
Group mapping CSS supplies responsive layout only; typography, colors, controls and
spacing inside each component remain Playbook-owned. Link, plus and remove glyphs
share the existing PlaybookIcon SVG shape, dimensions and stroke.

The public OIDC completion screen uses PageHeader and a canonical status card. The
login provider action is a secondary PlaybookButton with the shared link icon.
Profile loading/error/disabled/conflict, mapping empty/multiple/remove, dialog
Escape and narrow-screen composition must receive the same reference comparison
as existing pages.

### Account email screens

`/forgot-password`, `/reset-password` and `/verify-email` compose the shared
`PageHeader`, headerless `tw-card__body`/footer, `tw-field`/`tw-input`, `PlaybookButton` and icons.
Their only layout addition limits the form width; typography, colors, spacing and
controls come from the accepted Playbook. Footer actions use `tw-btns` for shared gaps. Verification proof in My account uses
`SettingsDialog`. Confirmation, missing/expired links, validation and unavailable
mail states use the same card structure. Public screens require no operator shell
or session and do not consume links on navigation. Ready-to-confirm email verification
has no input fields: omit the empty form row and put `tw-btns` directly in a padded
card body. Forms and result states use `tw-form-body` with a separate action footer;
success, missing/expired links and failures use the shared `InlineAlert` variants.
These public screens do not use Users & groups form classes. All copy is in `messages/en.json`.

## Account and Settings layouts

The accepted v1.4 update adds Field help (4.5): `tw-help`, `tw-help__btn`,
`tw-tooltip` and preview state `tw-help--open`. The icon button is 20px on desktop
and 32px with coarse pointers. `FieldHelp` keeps an accessible description linked
to the input; its visible tooltip opens on hover/focus/touch, can be dismissed with
Escape, and renders outside card clipping with viewport-aware placement. The portal
uses `tw-root tw-ui` to retain shared colors and fonts outside the app container. A tooltip
never submits its enclosing form. My account, Users & groups profile fields and Sign-in
fields, setup instructions and checkbox choices consume the same control.
Keep setup commands and values visible; put their supplementary explanations in
adjacent help controls, outside checkbox labels. `/playbook` includes a live example.

Account and Settings sections use `tw-t-section` (26px), canonical card heads and
footers, fact bands, `tw-fields` grids, `tw-disabled` reasons and `tw-alert` context.
`forms.css` contains the layout compositions from the references: padded form body,
fitting/wide field grids, fact bands, action rows and setup steps. No new palette
or typography is defined by a page. Profile changes show the existing Changed tag;
Settings marks the active section Unsaved while an update/sign-in draft differs.
Saving uses the same API/revision/permission contracts. Action buttons that only
edit a draft or open a dialog explicitly use `type="button"`.
An unchanged Save button is disabled without a companion message. Show Changed or
Unsaved only for a draft, and retain guidance for actionable blockers or failures.

Change password uses the action-card variant, a responsive grid of large inputs
and `RequirementList`. It reflects the current 15-character policy and matching
confirmation; the reference's sample 12-character rule does not change the policy.
My account's recovery alert reflects actual mail readiness and verification,
rather than the reference's older unavailable-email sample. The Agents page uses
On/Off segmented choices, catalogue facts and the shared Save footer. Update-policy
explanations use FieldHelp beside the label in both app defaults and server settings.
The email-verification modal uses a labeled fact band for its destination and a
shared form body with a full-width password input. A successful request updates the
existing recovery alert with request status and delivery guidance; it does not mark
the mailbox verified. Sign-in uses
help controls, secret/connected-account facts, explicit setup steps, mapping table
and session facts. Empty mapping tables retain headings; editable rows stack on
small screens. Repository rows and the Add footer use canonical card/field/button
items with current catalogue data and existing GitHub URL validation.

### Choice cards · Playbook v1.6 / 6.14

`ChoiceCards` and `choice-cards.css` own the accepted grid, 260px minimum (bounded
by container width), 12px gap, 16px padding, 11px radius, ink selected edge/dot and
3.7 In use tag. Options use `role=radio`/`aria-checked` inside a labelled radiogroup;
only the selected option enters the tab sequence. Arrows wrap, Home/End select the
first/last option, and focus follows selection. Native disabled buttons prevent
changes while saving or while the result is uncertain. `/playbook` includes live
and disabled examples. State coverage: selected, saved, pending switch, disabled,
keyboard focus, narrow container, loading/read error, failed/uncertain save.

### Settings sidebar

Settings sections share the Playbook `tw-list` / `tw-item` composition, with
`tw-item__main`, `tw-item__name` and a `tw-meta` description on every item. Use
these existing components and tokens for all sidebar states. No new sidebar CSS,
palette or typography is introduced. Order: Skill repositories, Agents,
Users & groups, Sign-in. Agents uses the stable description “Configuration and
default behavior”; Users & groups uses “Accounts and server permissions”.
Sign-in retains the saved method, falling back to its short description while
session data loads. Active and Unsaved markers keep the same shared styles.
The first item determines the default Settings content. Canonical URLs and tab
queries are listed in [Public UI navigation](../architecture/navigation.md).

### Shared sidebar width

The dashboard’s What changed today panel, Skills catalogue and Settings rail use
`--master-rail` (320px), extracted from the accepted Playbook master/detail width.
The dashboard keeps its rail on the right, gives remaining width to server groups,
and uses one full-width column when the panel is hidden. All three layouts stack
below 960px; the rail then fills the available width and releases sticky positioning.

### Dashboard status panel alignment

Needs attention, unknown and healthy panels start at the same left edge as the
standard 1240px content area, hero and footer. Counters do not consume a column
inside that area. At 1440px and wider, the 72px Playbook gutter sits 16px outside
the panel in the outer page margin. With less room, number and label form a row
above the panel, retaining the standard content edge without clipping or horizontal
scrolling. This applies with the changes sidebar shown or hidden. Counter type,
labels and tones come from the shared Playbook; feature CSS owns positioning only.
