# Skill display descriptors

`display.json` binds typed assessment facts to app-owned components. It cannot
supply HTML, CSS/classes, scripts, SVG or custom layouts. Health and host access
remain independent of display metadata. Packages without a descriptor keep the
plain fact/table presentation.

The descriptor has `format`, `sources`, `sections`, and optional `metrics` and
`dashboard`. Maximum size is 64 KiB and depth 12. Keys are stable lowercase
identifiers; labels/help reference parameter-free catalogue entries. Static
validation rejects unknown fields and invalid cross-references.

## Sources and bindings

Declare each fact key with scalar `kind` or table `kind`/`columns`. Scalars are text,
number, boolean, duration, time or percent. Numeric text can declare `encoding`
`decimal`/`uint64`; the optional empty-string missing marker is not zero. Units
include number/count/percent/bytes/seconds/milliseconds/celsius/bytes_per_second/
per_second. Numeric precision is 0–3. Text enums map raw values to catalogue keys;
`muted_values` must be members of that enum. `semantic: "status"` is unencoded text
and uses the shared status renderer.

Bindings use `{"fact":"key"}` and, within a table, `column`. Meter bounds and
threshold positions use a literal `value`, numeric `setting`, or numeric fact
binding with matching units. Up to two thresholds have distinct warning/critical
severities. Meter status is `"assessment"` or a status-semantic source binding.

## Sections and widgets

Format 2 sections have `id`, `role`, `title_key`, `widgets`; roles are current,
graph or details. At least one current section is required. Current/details have
non-temporal widgets; graph contains only temporal widgets. The app combines
supporting details and adds one compact collection History log. Format 1 legacy
collapsed/disclosure hints remain accepted; format 2 rejects them and per-widget
`default_window`.

| Widget | Required data beyond id/type/title_key |
| --- | --- |
| `facts` | `facts` list of scalar source keys |
| `table` | `source`, declared `columns`; optional column labels/meters |
| `meter`, `gauge` | Numeric value binding, min/max; optional thresholds/status |
| `line_chart`, `sparkline` | Declared metric |
| `bar_chart` history | `mode: "history"`, metric |
| `bar_chart` snapshot | `mode: "snapshot"`, table source, label/value columns |
| `donut` | Table source/label/value, or up to eight same-unit scalar parts |

There are at most 64 sources, 12 columns per table, eight sections and 24 widgets.
Widget IDs are unique across sections. The
[memory example descriptor](https://github.com/TinyWarden/tinywarden-agent/blob/main/skills/examples/memory-pressure/display.json)
is a complete admitted example with a table, meter, graph and dashboard field.

## Metric history

Declare at most eight metrics using numeric fact/column bindings. Table metrics
also declare stable text `series_key`/`series_label`; maximum series is 1–32.
Declared maxima total at most 128 samples per evidence frame. The engine materializes
values from accepted evidence; chart reads never execute package code or recompute
old observations. See [metric history](metric-history.md).

## Dashboard fields

Optional `dashboard.fields` contains 1–8 entries. Each has `id`, `label_key`, `type`
(value or meter), scalar `value: {fact}` and optional text `context: {fact}`. Meters
also have min/max and optional thresholds/status. The app supplies another aggregate
skill-health choice even without a descriptor. Field IDs remain stable across
versions; use a new ID if meaning changes.

Dashboard meters render compact numeric text; detailed server meters keep their
bars. Contextual values show the value first and a quiet code label after it.
Booleans render Yes/No with the assessment's tone; boolean truth alone is not health.
Time uses compact selected-timezone formatting with a full accessible timestamp.
Missing/ineligible data never becomes zero, No or Healthy.

Skills declare data/labels/context, not column widths. Tables adapt from headings
and values, with shared left/center/right alignment and mobile behavior. Primary
status uses a boxed pill; row status is a quieter text/cue. Follow the
[Playbook](../../contributing/playbook.md).

Exact closed syntax is enforced by the
[display validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/display.py)
and [widget validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/display_widgets.py).
