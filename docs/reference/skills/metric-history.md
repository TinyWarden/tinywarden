# Metric history and continuity

The app captures declared numeric metrics from the first accepted assessment in
the same transaction as its observation. Retries do not add points; future scheduled
assessments do not create new samples. Delayed/ineligible evidence cannot backfill
current metric history. No chart read executes package code or reads arbitrary host data.

Metric identity combines host, installation, metric key and stable series key. A
selected version includes compatible retained definitions with the same value
binding, unit and series identity. Labels/precision/layout do not rewrite stored
values. Give a measurement a new stable key when its meaning changes, even if its
type/unit remain the same.

Retention follows parent observations for 90 days. Graphs start with actually
captured numeric evidence; there is no fabricated backfill. Exact uint64 text stays
exact. Invalid/missing/overflow values create gaps. Unknown health alone does not
erase a valid number. Truncated table frames preserve present valid rows while
marking incomplete coverage.

Continuity breaks for missing/failed evidence, incomplete coverage, disappeared
series, changed agent/generation/settings/policy/enablement/recovery context or
expired prior evidence. Do not zero-fill, carry forward, or join across breaks.
A line joins permitted observations and does not prove the value between samples.

## Authorized read API

GET `/api/v2/operator/hosts/{host}/skills/{installation}/metrics/{metric}` requires
an authorized operator with access to the host. Required `from`/`to` are UTC ISO
bounds, inclusive/exclusive. Optional `digest` selects a retained definition;
`buckets` defaults to 240 (1–480); repeated `series` selects up to eight explicit
keys. Reject repeated scalar/unknown/malformed parameters. Window is at most 90 days
and cannot end after server now. Applied bounds intersect retained evidence.

Default format 1 returns buckets. `view=adaptive` returns format 2: individual samples
when candidate frames × selected series is at most 480, otherwise SQL aggregates.
Series include summaries and gaps; bucket output preserves min/max/last/count.
Discover at most 32 series and require explicit choice for multiple series.

Reads cap at 150000 candidate frames, two-second SQL statements and 512 KiB response.
Limits produce explicit range-too-large errors rather than silent partial success.
Responses are private/no-store and recheck authority. Widgets share one card window
and one compact History log; changing display metadata does not erase compatible data.

Implementation: [metric history](../../../server/skills/metrics) and the
[display validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/display_widgets.py).
