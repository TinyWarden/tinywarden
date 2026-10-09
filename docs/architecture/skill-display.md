# Skill Display API

Status: **implemented, formats 1 and 2**. Packages may bind SDK v1 facts and tables to
shared app widgets through an optional validated `display.json`.
the [history contract](skill-metric-history.md) defines its stored numeric series.
The Python [SDK v1](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/sdk-v1.md)
still owns observations, assessments, host access and resource limits.

The [shared structure contract](skill-widget-structure.md) defines the common
frame, format 2 section roles and compact History API. Use format 2 for new skills;
format 1 remains accepted and is normalized into the same shared frame.

## Boundary and compatibility

A skill supplies data and a description of how to display it. TinyWarden owns the
components, layout, styling, accessibility and interaction. Packages never supply
HTML, CSS, JavaScript, SVG, templates, expressions, SQL, URLs or executable renderers.
The same shared components and styles power the app and its public visual Playbook.
Visual examples do not add product actions or grant packages additional access.

Add an optional `display.json` at the ZIP root. It participates in the existing
content digest; changing it requires a new package version. Keep package
`format: 1`, `sdk: 1`, `runtime: "python-3.13-v1"`, the four Python functions and
the existing agent observation protocol. Collection does not consume UI metadata.
No new host operation is part of this API.

- No descriptor: existing facts/tables remain the complete display.
- Valid descriptor: render supported widgets and retain unrepresented facts and
  columns in an app-owned **Details** disclosure.
- Invalid descriptor, unknown format/type/property or invalid catalog reference:
  the upgraded importer rejects the package before activation; never execute it
  to discover its display shape. Author tooling uses the same validator.
- Old app/SDK readers can ignore the extra JSON file and render ordinary facts.
  Therefore every package must continue producing useful SDK v1 facts. An old
  validator accepting the ZIP does not certify its display descriptor.
- Runtime binding failures affect the relevant widget/metric, not validated health,
  notifications, other widgets or the original stored facts. Show an unavailable
  state and keep the ordinary fallback. Do not turn a display error into Healthy.
- History uses the original stored assessment and reason catalog for each collection.
  It does not replay old widgets or re-evaluate readings with today's settings.

The implementation must prove the existing agent can collect a descriptor-bearing
package. Changes to the generic controller inspector and author SDK are expected;
an agent update is permitted if necessary, but UI metadata is not a new wire field.

## Descriptor shape and bounds

All objects are closed: only documented properties are accepted. IDs/keys follow
the existing lowercase fact-key syntax (letter followed by up to 63 letters,
digits or underscores). All human labels/help reference parameter-free catalog
entries. Returned fact values and table labels remain escaped plain text.

| Root property | Contract |
| --- | --- |
| `format` | `1` or `2`; independently versions this display API. |
| `sources` | Map of 1–64 fact keys to scalar or table declarations below. |
| `metrics` | Optional map of up to 8 stable metric keys to history definitions. |
| `sections` | 1–8 sections: `id`, `title_key`, nonempty `widgets`. Format 2 also requires `role` (`current`, `graph`, `details`); format 1 accepts legacy `collapsed`/`disclosure`. |

Limits: 64 KiB UTF-8 descriptor, nesting depth 12, 24 widgets total, unique section
and widget IDs across the descriptor. Existing package/catalog/fact/table limits
also apply. Sections cannot contain sections; layout has no package-controlled
pixel sizes or arbitrary nesting. The app orders current results, graphs, one collapsed Details section and History.
Within each role, widgets retain declaration order and reflow on narrow
screens. Disclosure headings, legends and focus behavior are app-owned.
Reject duplicate JSON keys and non-finite numbers under the existing package
rules. The descriptor is not constrained to the observation-schema subset; it
has its own closed structure above.

### Sources and bindings

A scalar source is `{ "kind": <SDK scalar kind>, ...formatting }`. A table source
is `{ "kind": "table", "columns": { <column key>: <scalar declaration>, ... } }`.
A table declaration has 1–12 columns. It may describe a subset of actual columns;
extra actual columns remain available in Details. The app validates
each bound fact/column against its declared SDK kind when rendering/extracting.
Missing or mismatched values are unavailable; coercion from arbitrary strings or
booleans is forbidden. Unknown source references are an import error.

Bindings are exactly `{ "fact": "key" }` for scalars, or
`{ "fact": "table_key", "column": "column_key" }` within that table's row.
Column bindings cannot escape their own row or join tables. No JSONPath, formulas,
sorting programs, joins, calculated fields or remote data sources are supported.
Compute derived values in `evaluate`, which is already responsible for facts.

Optional scalar formatting properties:

| Property | Allowed values and rules |
| --- | --- |
| `unit` | `number`, `count`, `percent`, `bytes`, `seconds`, `milliseconds`, `celsius`, `bytes_per_second`, `per_second`. Numeric sources only. Defaults: number→number, percent→percent, duration→seconds. |
| `encoding` | Only for text facts: `decimal` or `uint64`. Decimal is a signed canonical base-10 string, no whitespace/exponents/plus, at most 32 characters and 9 fractional digits. Uint64 is canonical unsigned decimal from 0 through 18446744073709551615. |
| `missing` | Only with numeric text encoding; exactly `""`. This explicitly treats an empty string as missing. Otherwise malformed strings are invalid, never zero. |
| `precision` | Integer 0–3, display rounding only; default chosen by the unit. |
| `enum` | Only for unencoded text: map of up to 32 exact values to catalog label keys. Unlisted values remain escaped text. |
| `semantic` | Only `status`, for unencoded text without `enum`. Recognizes `healthy`, `warning`, `critical`, `unknown`, `informational`; other values display as unknown with their original text available. |

Numeric units require a numeric SDK kind or numeric text encoding. Percent is
bounded to 0–100; duration and byte units are nonnegative. Byte integers supplied
as numbers must be safe integers. Time facts always mean UTC milliseconds and
use the app's date/time formatter; boolean facts use translated Yes/No. Formatting
properties that do not apply to a kind are rejected. Precision does not apply to
time, boolean, enum or status.
SDK percent/duration kinds must retain percent/seconds units respectively; use
number facts for other numeric units. Count values are integers. Unencoded text
cannot acquire a numeric unit merely by declaring one.
Decimal strings match `-?(0|[1-9][0-9]*)(\.[0-9]{1,9})?`; normalize trailing
fractional zeros and negative zero before storage. Uint64 has no sign, decimal
point or leading zeros except the single value `0`.

Bytes use exact integer arithmetic and readable binary units (B, KiB, MiB, GiB,
TiB, PiB, EiB), with the exact count available in accessible detail. Do not pass
uint64 strings through `Number` before formatting/comparison. Chart coordinates
may be scaled approximations; source values, threshold tests and tooltips retain
their defined precision. Number rounding never changes health.

### Ranges, thresholds and sampled status

A numeric reference is `{ "value": <finite number> }`,
`{ "setting": "field" }`, or a numeric binding above. Setting references must
name numeric fields in `settings.schema.json`; they resolve from this reading's
effective assignment. Table bindings resolve only in the current row. Numeric
references must have the same unit as the displayed value; literal/setting values
use that unit. Ranges have `min` and `max`, with `min < max`.

Meters/gauges accept optional `thresholds`, at most two entries, each containing
`at` (numeric reference) and `severity` (`warning` or `critical`, unique). Markers
must be distinct and inside the range; sort them by value for drawing. Lower-is-
worse metrics may put critical below warning. This only places labeled markers.
Invalid ranges/markers show a local unavailable state rather than inventing bounds.
Out-of-range readings keep their actual value and an explicit overflow indicator.

Optional `status` is `"assessment"` or a binding to a declared status source.
It supplies a sampled status color; omitted means neutral. Thresholds do not
calculate health or silently supply status. The app's contact/evidence/authority
state takes precedence for the current card; old sample colors must be labeled as
sampled. Packages cannot supply arbitrary colors or hide stale/unknown state.

## Widgets

Every widget has `id`, `type`, `title_key`, optional `help_key`, plus only the
properties in this table. A history metric reference is its key in `metrics`.

| Type | Properties and behavior |
| --- | --- |
| `facts` | `facts`: ordered unique source keys for 1–16 scalar facts. Uses their catalog labels and declared formatting. |
| `table` | `source`: table key; `columns`: 1–12 ordered `{key, label_key?, meter?}` entries. `meter` has `min`, `max`, optional `thresholds` and `status` as above; the column supplies the value. Other columns use source formatting. Preserve rows, incomplete/truncated indicators and accessible headers. |
| `meter` | Numeric scalar `value` binding, `min`, `max`, optional `thresholds`, `status`. Horizontal usage/capacity bar with readable value. |
| `gauge` | Same fields as meter, rendered as a gauge. |
| `line_chart` | `metric`. Uses retained compatible history. Format 1 accepts legacy `default_window`; the shared card owns its 24 h / 7 d / 30 d / 90 d range. Format 2 rejects that property. |
| `sparkline` | Same fields as line chart, compact; retain an accessible value/range summary and history detail. |
| `bar_chart` | `mode: "history"` with the line-chart fields, or `mode: "snapshot"` with `source` (table), `label` (text column) and `value` (numeric column). Snapshot charts show at most 32 rows, preserve input order and never silently take a subset. |
| `donut` | Either `parts` (1–8 `{label_key, value}` numeric scalar bindings) or `source`, `label`, `value` table-column references (1–8 rows). Never both. Same units, nonnegative values, complete data required. Sum supplied parts, not an invented total. Zero total is empty. Missing/truncated data is unavailable. |

Tables may scroll within their card at narrow widths; the page must not overflow.
Table labels and values are keyboard/screen-reader accessible. Charts also have a
text summaries and point/bucket inspection using pointer or keyboard (Left/Right,
Home/End), including last/min/max/count. There is no second visible history table. App-owned series colors are categorical,
not health claims; status cannot be conveyed by color alone. No animation is
required for understanding values. Respect reduced motion and sufficient contrast.

`truncated: true` remains explicit on tables. Snapshot charts/donuts cannot imply
a complete population from such tables. History may preserve present rows while
showing incomplete coverage, under the metric extraction rules. With a display descriptor, only explicitly declared widgets appear. Unreferenced
facts and columns are retained as evidence, but are not automatically dumped into
Details. Missing or incompatible declared bindings still show unavailable data.
In Details only, valid empty tables disappear unless marked truncated. Empty plain
text facts disappear unless the source maps the empty value to a catalog label;
zero and false remain visible. Hide an empty section and omit Details when all its
sections are empty. Descriptorless packages retain the generic facts view.

### Metric declarations

Each metric has `title_key`, numeric `value` binding, and optionally
`series_key`, `series_label`, `max_series`. A scalar metric has no series fields
and uses the fixed series key `scalar`. A table metric requires `series_key` and
`series_label` naming unencoded text columns of the same table. `max_series`
defaults to 16 and is bounded to 1–32. Metric unit/encoding come from the value
source; no metric-specific arithmetic or evaluation hook exists.

Series keys are nonempty plain strings of at most 128 UTF-8 bytes, without control
characters. They must be unique within the metric at a reading and stable for the
logical thing measured. Never use row number or an unstable kernel mount ID.
Labels are at most 256 UTF-8 bytes and are presentation only. The author may hash
a longer identity into a key; the app never joins series by their displayed label.
Values that cannot be represented within the history limits are missing in that
metric, with an explicit error. Do not reject an otherwise valid observation.

## Complete small descriptor example

This binds three ordinary SDK facts: percent `used`, text `total_bytes`, and text
`available_bytes`. It requires numeric settings `warning_percent` and
`critical_percent`, and parameter-free catalog entries for every `*_key` below.
The skill's existing evaluator still owns threshold status and limited assurance.

```json
{
  "format": 2,
  "sources": {
    "used": {
      "kind": "percent",
      "unit": "percent",
      "precision": 1
    },
    "total_bytes": {
      "kind": "text",
      "encoding": "uint64",
      "unit": "bytes"
    },
    "available_bytes": {
      "kind": "text",
      "encoding": "uint64",
      "unit": "bytes"
    }
  },
  "metrics": {
    "used_percent": {
      "title_key": "used_label",
      "value": {
        "fact": "used"
      }
    }
  },
  "sections": [
    {
      "id": "capacity",
      "role": "current",
      "title_key": "capacity_title",
      "widgets": [
        {
          "id": "usage",
          "type": "meter",
          "title_key": "used_label",
          "value": {
            "fact": "used"
          },
          "min": {
            "value": 0
          },
          "max": {
            "value": 100
          },
          "thresholds": [
            {
              "at": {
                "setting": "warning_percent"
              },
              "severity": "warning"
            },
            {
              "at": {
                "setting": "critical_percent"
              },
              "severity": "critical"
            }
          ],
          "status": "assessment"
        },
        {
          "id": "sizes",
          "type": "facts",
          "title_key": "sizes_title",
          "facts": [
            "total_bytes",
            "available_bytes"
          ]
        }
      ]
    },
    {
      "id": "history",
      "role": "graph",
      "title_key": "usage_history_title",
      "widgets": [
        {
          "id": "trend",
          "type": "line_chart",
          "title_key": "usage_history_title",
          "metric": "used_percent"
        }
      ]
    }
  ]
}
```

## Empty, missing and historical states

Zero is a reading. Missing is not zero. An empty table is a valid empty collection;
it is not a failed request. Unknown health, absent metric, truncated evidence,
failed fetch, loading, stale snapshot and a genuinely empty history are distinct
app-owned states. A donut/gauge must never show a reassuring full/empty colored
shape when data is absent. Network errors retain the last snapshot only with its
timestamp and stale/error indication; delayed responses cannot overwrite a newer
host, selected skill or range.

Current widgets show the existing reading timestamp and interval metadata. A
timestamp inside a fact describes that fact: an old weekly execution time does
not make a freshly observed systemd timer stale. The app uses the existing
assessment/authority/freshness projection for the card. History ends at the last
real reading and has no interpolated future, zero-filled outages or fabricated
pre-installation data. Historical details always identify their sampled context.

## Official packages use the same API

- **Disk space:** readable sizes, filesystem table with usage meters, sampled
  per-mount status and exact-assignment markers; expandable mount/coverage details;
  a per-mount percentage history. Keep all observed mount details available.
- **Package updates:** four counts and grouped simulation/assurance facts. History
  can chart the stored counts. No invented per-package list or security-update count.
- **Reboot status:** marker and limited-assurance facts; no graph is necessary.
- **Filesystem trim:** separate timer, service and last-execution fact groups.
  Scheduled assessment changes do not become extra numeric samples or imply new
  service executions. Preserve the existing schedule-aware health meaning.

For disk, restore the canonical [capacity rule](disk-observations.md):
`used = total - free`, `denominator = used + available`. Use exact integer
threshold comparisons; display percentage is half-up rounded to one decimal.
Invalid capacities remain unknown; read-only mounts remain informational.
The new package version records new percentage facts; old package assessments
are not recalculated. A path-series key identifies the logical mount path/root/
filesystem kind, not a physical disk or a kernel mount ID. Hash the full original
identity before any label truncation. Version/generation boundaries break history.

New widget types, encodings or host operations are future platform capabilities.
Ordinary new skills combining this documented set require no further core change.

## Planned presentation extension

[Shared skill presentation](skill-presentation.md) specifies the next additive
options and adaptive history response. It is implemented; the existing
contract above remains the currently available behavior.

### Section headings

The app displays the section title once when a section has one visible widget.
Widget titles appear as subheadings only in sections with multiple visible widgets.
This applies to all shared widget types; skills do not customize heading markup.
