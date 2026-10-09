# Shared skill structure and reading history

Status: **implemented**. Display formats 1 and 2 remain supported. This document
is the canonical shared card structure and compact collection-history API contract.
See [display](skill-display.md) for widgets and bindings and
[presentation](skill-presentation.md) for adaptive graph behavior.

## Shared frame and vocabulary

Every skill uses this app-owned order:

1. Header: name, status, short current result, last checked, interval, version,
   Run now and Settings. Existing action eligibility and settings guards apply.
2. Current results: useful facts and supported snapshot widgets, visible.
3. Existing measurement graphs, when declared, visible. This is the measurement
   history; do not add another historical graph.
4. Details: one initially collapsed disclosure for supporting explanations and
   facts, omitted when empty. Important limitations and explanations of unknown,
   stale or failed current results remain visible near the current result.
5. History: one initially collapsed disclosure, always last, including for skills
   without graphs or readings. It contains the compact collection log below.

Current results and graphs need not have generic printed headings. Packages keep
meaningful catalog-backed subheadings. The app supplies Details, History, Last
checked, Run now and Settings through its English translation catalog. Online and
Offline describe agent contact; Healthy, Warning, Critical and Unknown describe
skill results. Disabled describes current enablement, not a fabricated reading.

There is no separate Chart readings or Recent readings disclosure and no nested
replay of an old widget. Graphs preserve accessible descriptions and point/bucket
inspection, including min/max/count when aggregated; removing a visible duplicate
table must not make their data inaccessible to keyboard or screen-reader users.

## Display format 2

The ZIP's optional `display.json` gains **format 2**. Package format, SDK number,
Python functions, observation protocol, sources, metrics and metric identities
stay as in display format 1. All objects remain closed and all existing descriptor
size/depth/widget/catalog/binding limits apply.

Each section has exactly `id`, `role`, `title_key`, `widgets`. Role is one of:

| Role | Contents |
| --- | --- |
| `current` | Existing facts, tables, meters, gauges, snapshot bars or donuts. |
| `graph` | Existing line charts, sparklines or history-mode bar charts. |
| `details` | Supporting facts or any supported non-history widget. |

Require at least one current section. Preserve declaration order within each
role, then render roles in the shared order. Render all details sections inside
one app-owned Details disclosure. Put otherwise unrepresented facts/columns there
as well; do not discard evidence or create a second Additional details container.

Example section (using an already declared fact/catalog key):

```json
{
  "id": "result",
  "role": "current",
  "title_key": "result_title",
  "widgets": [{"id": "facts", "type": "facts", "title_key": "result_title", "facts": ["value"]}]
}
```

Format 2 disallows section `collapsed`/`disclosure` and widget `default_window`:
initial visibility and the common time window belong to the app. A package cannot
declare its own History slot, reorder app controls, add rendering code, or hide
the shared log. Invalid role/widget combinations reject package admission.

Format 1 and packages without descriptors remain supported. For format 1, the
renderer routes temporal widget types into the graph area and other widgets into
current results, preserving relative order and labels. Unbound evidence goes into
Details. Mixed old sections may be split by widget type. Do not guess roles from
skill IDs, English titles or old collapsed flags. Legacy disclosure/default-window
fields remain valid input but the new shared frame owns their presentation.
No-descriptor packages show their ordinary facts plus the shared History log.

Publish changed official descriptors as new package versions; never edit stored
package metadata/digests in place. Format 2 requires an updated importer and Python
package inspector on the agent. Upgrade that generic inspector before assigning
format 2 packages. An older inspector rejects an unsupported format explicitly.
New skills using this supported contract require no per-skill app/agent changes.

## One compact History log

History entries represent accepted **collections**, not individual numeric series,
scheduled ticks or chart buckets. One disk collection covering ten filesystems
is one entry. Failed collection and nonnumeric results also belong in the log.
Selecting a filesystem changes its graph, not the skill's collection log.

Rows show **Time / Result / Note**, with no expanded snapshots or copied metrics.
The recorded first assessment supplies the result for an observed reading.
Healthy rows have no repetitive note. Warning, critical and unknown rows use the
original catalog-rendered reason. Collection failures use an app-owned reason and
Unknown result; a missing/invalid assessment is never treated as Healthy.
Delayed, expired or clock-invalid observations remain visible with their recorded
app-owned explanation. Do not invent readings for gaps, disabled periods or
requests that never produced a stored observation.

Notes are escaped plain text, capped at 240 Unicode code points with an ellipsis
when shortened, using the shared control-character handling. They never execute
package code or use today's settings/catalog to reinterpret an older reading.

Default window: last 24 hours. Shared choices: 24 h, 7 d, 30 d, 90 d. Ten rows per
page, newest first, with direct numbered pages and an exact count within the applied
window. Use correct singular/plural labels. Empty states distinguish no readings
from a failed request. Fetch the log/count when opened, not on every host poll.

Every skill's History displays the same 24 h / 7 d / 30 d / 90 d controls,
whether the skill has graphs or not. Graph controls mirror the same selected
duration; they never maintain an independent window. Freeze the card's common
time anchor while History is open so graph bounds and pagination agree. Show the
through-time and a Refresh action. Refresh or changing the range resets to the
new first page; closing History resumes the graphs' normal rolling window. Current
result/contact/manual-run status continues updating independently. Preserve open
state, loaded charts and scroll position during background updates. Auth loss
clears protected contents; failed refresh retains correctly labelled loaded data.

## Operator history endpoint

`GET /api/v2/operator/hosts/{host}/skills/{installation}/readings`

Use the existing operator session authorization, scoped host/installation checks,
read transaction/timeouts and completion authorization. Return private/no-store
JSON. This is a read-only operator API; descriptors cannot provide URLs or SQL.

Closed query parameters: `from`, `to`, optional `cursor`, or the numbered-navigation
parameters `page`, `as_of`, `jump_at`. Cursor and numbered parameters cannot mix. Require canonical UTC
millisecond timestamps, `from < to`, at most 90 days, no duplicate/unknown keys,
and no future `to`. Page size is fixed at ten. Use the same effective sample time
as metric capture: `least(finished_at, received_at)` when outcome is observed,
otherwise `received_at`. Requested bounds are half-open `[from,to)`.

Apply the live 90-day receipt retention cutoff on every request, including cursor
requests; also clip the requested window to that cutoff. Include all retained
versions and outcomes for this host/installation. The log's stable time/status/note
shape does not depend on numeric schema compatibility. Graphs continue applying
the existing metric compatibility rules; neither path re-evaluates old facts.

Response format 1 contains:

- `host`, `installation`, `as_of`: scope and the first-page receipt watermark.
- `requested`, `applied`: `{from,to}` bounds, plus `retained_cutoff`.
- `total`, `page_size: 10`, `next_cursor` (string or null), `page` (one-based),
  `jumped_to` (selected reading ID or null).
- `readings`: up to ten objects containing `id`, `at`, original `finished_at`,
  `received_at`, `outcome`, `status`, `note` (string or null), `current`, and
  `version`. No observation payloads, facts, settings, Python output or catalogs.

Cap the serialized response at 32 KiB. Display format 2 and this response's format
1 are independently versioned contracts, as is the existing metric response.

Order by effective sample time DESC, observation ID DESC. Use keyset pagination;
legacy cursor callers keep their existing keyset behavior. A canonical bounded base64url
cursor carries format, host, installation, requested bounds, first-page `as_of`
and last `(at,id)`. Reject malformed/noncanonical/oversized (>1024 bytes) or
scope/range-mismatched cursors. Revalidate timestamps, IDs and authorization;
a cursor conveys no authority and is never interpolated into SQL.

Exclude receipts newer than the first-page watermark. New arrivals are shown on
Refresh, so background polling cannot shift the page. This is not a database
snapshot held across requests: retention/deletions or late transaction commits
can affect the count. Keyset navigation preserves ordering without offset drift.

Compute the count and page in the same short read transaction, returning only the
small required JSON fragments from assessments and the selected versions' reason
catalog entries. Do not fetch entire historical observations or invoke skills.
Use an indexed scan capped at 150,001 candidate rows per host/installation/window;
over 150,000 return `range_too_large`, never a misleading partial total. The UI
asks for a shorter range. Preserve the existing bounded statement/lock timeouts.

Add one expression index for `(host_id, installation_id, effective_sample_time
DESC, id DESC)` using the exact CASE expression above, through the next available
migration. Keep original rows/receipt retention and metric capture unchanged.
The timeout-bounded transactional migration must fail cleanly rather than waiting
indefinitely behind live locks. This index supports count/range/keyset reads;
there is no new history table, worker or retention job.

The existing latest-results API remains backward compatible. Add an optional
`include_readings=false` mode to omit its legacy historical rows/catalogs; default
retains the old response. The new server page uses that mode and obtains History
only through the paged endpoint. Latest facts/manual status stay in the normal
projection. Validate the new parameter with the existing HTTP request boundary.

### Direct navigation extension

The app uses numbered pages to reach any retained page without sequential cursor
requests. `page` is a canonical integer from 1 to 15000; fixed size remains ten.
`as_of` preserves the previous response's receipt watermark and must be a canonical
UTC instant no later than server authorization time. It conveys no authority:
every request still authorizes the operator and validates host/installation scope.
`jump_at` must lie inside the requested window. The server selects the nearest
retained collection, breaking equal-distance ties by time DESC / ID DESC, computes
its page and returns its ID as `jumped_to`. Empty ranges return page one and null.
The client highlights only that original row. No original assessment is rerun.

A requested page beyond the remaining total clamps to the last available page,
so physical retention cannot strand navigation. Counts and page lookup share the
existing bounded transaction; direct offsets and nearest-time scans operate only
within the existing 150000-row candidate cap and two-second statement timeout.
No new table/index/job/migration or agent change. Legacy keyset cursor requests
remain supported and retain their scoped canonical validation and receipt watermark.

Custom bounds and presets are one card-level state shared by graphs and History.
Custom ranges stay fixed when History closes; clearing returns to the last preset.
Date fields use the displayed application timezone and convert to canonical UTC;
nonexistent daylight-saving wall times reject, and repeated wall times resolve
deterministically. Time navigation, paging and reading marks are app-owned shared
controls. Skills supply no query code, markup or navigation hooks.

### Useful Details

Display descriptors explicitly choose Details content. Do not repeat the header,
current values, settings or collection History. Missing declared data is labelled
unavailable; valid empty tables and empty plain text with no empty-value enum
label disappear in Details. Truncated tables remain visible. Zero and false are
data, not empty content. Omit Details when no declared content remains. Unbound
facts are retained in stored evidence but not rendered automatically. Packages
without a descriptor keep the generic facts fallback.

The official Package updates Details uses the shared table renderer for package,
installed version, available version and planned action. It parses only recognized
APT simulation records, keeps up to 100 rows and marks incomplete/truncated lists.
A missing version is shown as —; held-back names do not imply a known candidate
version or explanation. Counts and severity still come from the simulation summary.
The collector never refreshes metadata or installs packages. Numeric metric bindings
are unchanged, so compatible retained graph readings remain available.

### Single-item section headings

A section containing one visible widget displays only its section heading.
Multiple-widget sections may give each widget a subheading. This shared rule is
independent of catalog wording and skill identity. Authors should choose a clear
section title; the official disk capacity table uses “Filesystems.”

### Series label ordering

Tables bound to a metric with a `series_label` sort rows alphabetically by that
display label. Chart series pickers use the same English ordering. This shared
presentation rule does not change collection order or stored readings. For
table-backed metrics, chart choices come from the latest assessment rows using the
declared `series_key` and `series_label`, matching the current table. Historical-only
rows are not offered. Each listed series still includes compatible retained history
in the selected time range. The first alphabetical row is selected automatically
(so `/` is the initial disk choice). If a selected row disappears, select the first
remaining row; never keep showing that absent row's chart.
Scalar charts remain unchanged; no skill-specific renderer or API extension is needed.

The table-backed chart uses Playbook 8.3 Series picker C inside its header, with
the latest formatted metric value beside each label. Values bind to the same
assessment table and scalar source as the metric; missing values are shown as —.
Its visible label comes from the linked table widget's catalog title, falling
back to the table fact's catalog label: for disk space it reads “Filesystems”.
More than eight choices adds local label search. Pointer, keyboard, Escape and
focus dismissal use the shared component. A series stays selected whenever rows
exist. Empty/current-unavailable rows do not fall back to historical-only choices.
