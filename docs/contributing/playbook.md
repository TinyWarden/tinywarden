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
| Pagination in a card | `CardPagination` or canonical padded body/footer |
| Skill settings actions | `SettingsFooter` |
| Resource selection | Shared resource selector and filters |

Primary screen and section statuses use boxed pills. Secondary statuses in rows
and lists use text status with a cue. Preserve visible words and supplied status
semantics; never infer health from a translated label or package identity.

## Layout and tables

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
