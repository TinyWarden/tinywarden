# Shared skill presentation and adaptive metric history

Status: **implemented**. This additive extension builds on
[Display API v1](skill-display.md) and [metric history v1](skill-metric-history.md).
Existing descriptors and default format1 reads remain compatible.

The [shared structure contract](skill-widget-structure.md) defines the current
frame, section roles and compact History log. There are no duplicate chart-reading
tables or expanded historical widgets.

## Shared presentation

The app owns the skill frame, section slots, disclosures, fact grids, chart range
controls, compact collection log and settings dialog. These are reusable
React components with the canonical Playbook classes; the public `/playbook`
uses the same implementations. Packages provide typed data and closed JSON
options. They cannot supply markup, CSS/classes, SVG, scripts or layout programs.

Render all declared sections in order using `tw-skill__slot` and its padded
variant. Use `tw-disclosure` for expandable sections, `tw-chart` for plots and
`tw-table` for the compact collection log. Keep headings, borders, spacing and type from
the shared stylesheet. Any responsive integration rule must serve the component
generically, without skill IDs, package names or selectors for individual skills.

Numeric facts use the Playbook mono variant automatically, including encoded
numeric text. Actual missing values and explicitly muted text remain distinct in
the model even when the Playbook renders both with its subdued fact style.
Current health comes from the existing assessment/contact projection; cosmetic
metadata never supplies or changes health. Metadata uses real version, Last checked time with timezone and a compact translated cadence, such as `Every 1 h`.

### Legacy descriptor options and shared roles

Display `format: 1` continues to accept these optional, closed properties:

| Object | Property | Meaning and validation |
| --- | --- | --- |
| Section | `disclosure` | Exactly `"open"` or `"closed"`: an expandable section and its initial state. Mutually exclusive with the presence of legacy `collapsed`. These legacy layout hints are accepted but the shared frame controls expansion. |
| Scalar source | `muted_values` | A nonempty array of up to 32 unique strings, each an exact key in this source's existing `enum`. Therefore only unencoded text with an enum can use it. Values keep their translated text; an exact raw-value match uses subdued styling. No missing/unknown/health inference. |

The existing descriptor byte/depth/count and catalog bounds still apply. Older
validators may reject packages using these additions; update the platform's
shared inspector before activating such a package. Descriptors without the new
properties remain valid and keep their semantics. A changed descriptor requires
a new immutable package version. No observation/assessment protocol, collector,
settings schema or host-access capability change is implied.

Format 2 sections declare `current`, `graph` or `details`; `collapsed`,
`disclosure` and widget `default_window` are rejected. Current sections cannot
contain temporal widgets; graph sections contain only temporal widgets. Details
contains supporting non-temporal widgets. The app combines Details and all
unrepresented facts/columns into one initially closed disclosure. Legacy mixed
sections split by widget type without matching skill IDs or heading text.

## Adaptive history read

Extend the existing authorized metric GET with one optional scalar query:
`view=adaptive`. Absence preserves the current format1 bucket response exactly.
Reject other view values and repeated view parameters. The adaptive response has
`format: 2`; it retains format1 identity, units, requested/applied bounds, authority,
retention and series-selection rules. No new agent endpoint or DB migration is
required; use existing frames, samples and immutable observation/assignment data.

Keep the existing 90-day window, 150000 candidate frame ceiling, 2-second SQL
statement timeout, 512 KiB serialized response, at most 8 selected series and
32 discovered series. Work-limit checks must precede expensive expanded scans.
Queries stay parameterized and operator-authorized with the final authority
recheck, private/no-store responses, two concurrent page chart fetches and stale
response cancellation. Do not run package code or fetch raw observation blobs.

Choose one representation for the response:

- **samples:** when candidate frame count × selected series count is at most480,
  return their ordered individual points, including null-valued gap frames.
- **buckets:** otherwise aggregate in SQL using the existing requested bucket
  bound and preserve min/max/last/count. Do not load the candidate set into JS.

Each series includes `key`, `label`, series-specific `first_available`, a
`summary` with `readings`, `last` and `last_at`, and `gaps`. The summary counts
actual valid numeric samples in the applied window, never buckets or gap frames.
The root `representation` is `"samples"` or `"buckets"`. Depending on it, each
series contains exactly `points` or `buckets`:

- Point: `at`, `value` (canonical decimal string or null), `valid_until`,
  `incomplete`, `connect_from_previous` and bounded app-owned `reasons`.
  Timestamp is the stored sample time. Order ties by stored run sequence then
  observation ID; never deduplicate distinct readings with identical timestamps.
- Bucket: existing fields plus `frame_count`, the number of examined frames in
  that bucket. `count` continues to count numeric samples. An empty time bin and
  a bin containing failed/missing readings must remain distinguishable.
- Gap: `{from,to,reason,coarse}` with UTC bounds clipped to the requested window.
  Reasons are `retention`, `before_first_retained`, `evidence`, `coverage`,
  `context`, `extraction` or `unavailable`. Coalesce adjacent equal reasons.
  Raw gaps are exact and bounded by point count plus two per series. For aggregate
  responses, coarsen internal gaps to plot bins when necessary (at most480 per
  series, plus leading/trailing boundary bands), set `coarse: true` and describe
  those bands as containing a gap, not as wholly unobserved time. Never drop a
  break to meet a size limit; use existing explicit range-too-large behavior.

All extra boundary/summary reads are also bounded. Inspect at most one preceding
retained frame per selected series to establish continuity at the left edge;
never return an expired or out-of-window value as an in-window observation.
Preserve the current explicit selection requirement for multi-series metrics.
No new pagination or unbounded raw-reading endpoint is part of this extension.

Background reads, including the two-second Run now status polling, keep the last
loaded chart and collection log mounted while the same selection refreshes.
Only a changed host, installation, package, metric, time range, series or historical
context starts a new loading state. A failed refresh leaves the last timestamped
readings visible with a refresh warning and retry action. Permission loss clears
the operator view immediately. A status poll must not collapse chart height or
reset History or point inspection.

### Continuity and gap meaning

The adaptive view determines continuity from successive evidence frames, rather
than the presence of a reading in every plotting bin. A scheduled hourly reading
can connect to the next hourly reading when it arrives within the previous
reading's evidence expiry and no intervening break exists. Empty plotting bins
alone are not evidence of missed readings. This supersedes the empty-bin break
rule only for format2; format1 keeps its published compatibility behavior.

All existing substantive breaks still apply: null/failed/invalid extraction,
incomplete table coverage, disappearance, changed agent/generation, settings,
host policy, enablement, recovery epoch or version, and expired prior evidence.
For aggregate output, retain these breaks before grouping. Connect successive
nonempty plotted buckets only when their underlying evidence is continuous and
neither bucket contains an internal break. Never silently discard an intervening
null-valued frame. Render individual points at real sample timestamps, with
isolated points visible. Aggregate plots retain the min/max envelope/whiskers.

A line joins two permitted observations; it does not create samples between them.
Do not extend the last value to now, fill absent data with zero, carry values over
breaks or infer health from a graph. Shade the leading pre-data/retention period
and actual intervening/trailing evidence gaps. Trailing expiry uses the last
accepted reading's expiry, not its configured interval alone. A context change
breaks the connection even without a measurable outage duration.

Use truthful labels such as `Before first retained reading` and `No valid reading`.
The earliest retained point does not prove when capture or a version first began.
Do not copy a sample reference's `Before v1.1.0` claim without stored evidence.
Keep the selected version and 90-day retention visible using real metadata.
Compatible prior-version readings are included under the [metric compatibility
contract](skill-metric-history.md#identity-and-gaps); original values and version
boundaries remain intact.

### Controls and collection history

Each card has one shared time window: 24 h by default, or 7 d / 30 d / 90 d.
Every skill exposes the same selector inside History. Graph selectors mirror
that shared value rather than keeping their own range. Opening History pins the
common graph/log bounds, shows the through-time, and enables Refresh. Range changes
and Refresh reset paging; closing History resumes rolling graph bounds. Current
status, agent contact and Run now continue refreshing independently.

Graphs expose original point values or bucket last/min/max/count through pointer
and keyboard inspection (Left/Right, Home/End), with a screen-reader description.
Do not add a chart-reading table or another historical graph.

## History and settings

History is last and initially closed, lazy loaded from the protected
[collection endpoint](skill-widget-structure.md#protected-collection-history-api).
It shows Time / Result / Note, ten rows per page newest first and the actual total
inside the selected time range. Each row is one collection, regardless of how many
filesystems or metrics it contains. Healthy rows have no repetitive note; issues
and failed executions retain a bounded plain-text reason from the original
assessment/catalog. No copied metric values or expandable old widgets.

All retained versions and outcomes are included in this generic log. Numeric
graphs independently select compatible measurement definitions. Normal page polls
use latest-results `include_readings=false`, preserving the legacy API default
without repeatedly downloading full observations.

Settings in the header opens the common dialog with its actual server/skill,
per-field defaults/custom values and existing validation/save/concurrency/retry
behavior. Keep guarded Close/X/Escape/backdrop handling and the label `Save`.
`Edit global defaults` navigates to the actual Skills page and selects the same
installation; the selector must be validated and respect unsaved-change guards.
Use ordinary `?skill=<installation UUID>` selection state, not a mock route.
Missing selection falls back to the existing catalogue selection behavior.
