# Shared Playbook and skill widgets

Open `/playbook` on your TinyWarden installation. It is public, uses static sample
data and imports the same React components and styles as server skill results.
Copy reports success only after the browser accepts the clipboard write. Examples
are visual guidance, not extra app features or access granted to a skill.

## Source and styling

`components/playbook/tokens.css` owns the colors, typography and spacing from the
accepted Playbook. `components.css` imports its component modules and the small
widget integration stylesheet. Fonts are served locally from `public/fonts`.
`components/operator/tokens.css` contains compatibility aliases for older pages;
do not copy a second palette into a feature.
Compatibility resets must have lower specificity than Playbook controls. They
must preserve the shared link colours, keyboard focus rings and disabled states.

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
| `controls.tsx` | `PlaybookButton` (primary, secondary, danger), `StatePill`, `WidgetState`, `EmptyState`. |
| `page.tsx` | `PageHeader`: canonical page title, lead description, optional metadata and actions. |
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

Use `EmptyState` from `controls.tsx` for an empty list or search result. It uses
`tw-empty`, its title and supporting text. Table loading/error/empty rows use
`tw-table__state` and `tw-table__empty`; omit body wrappers when there is no content.
Skill repository source and fingerprint belong inside Technical details, rendered
with `DetailsGrid`, rather than as a separate unstyled paragraph between disclosures.

Access tables use the comfortable, responsive stacking variant and shared entity,
text and numeric cells. A column group gives the name the remaining width and
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

Dashboard section layout uses `tw-fleet-group` and `tw-fleet-gutter`; reserve
`tw-group` and `tw-gutter` for their Playbook components. The operator header is scoped to its app-shell child, and the dashboard hero
uses `tw-fleet-hero`, so neither can override gallery examples. Page-specific CSS owns layout, positioning and responsive composition,
while the Playbook owns each control's appearance.
