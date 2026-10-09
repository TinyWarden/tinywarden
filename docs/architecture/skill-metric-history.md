# Skill metric history v1

Status: **implemented, format1**. This is the historical-data part of the
[Skill Display API](skill-display.md). It adds bounded numeric projections of
stored assessments; it does not add an agent upload route or a health evaluator.

## Capture once from accepted evidence

After ordinary validation/evaluation and the transaction's final authority/cursor
recheck, extract declared metrics from the **first** stored assessment only.
Insert derived history in the same transaction as the accepted observation.
Use its exact package descriptor, catalog and assignment settings. Never call
package code from a chart read or re-evaluate old observations using current code.
Packages without declared metrics create no metric frames or samples.

Eligible numeric samples require `current: true`, outcome `observed`, and a
validated first assessment. Healthy, warning, critical and unknown assessments
can all contain real numeric facts; unknown health must not erase a valid number.
Future scheduled assessments do not generate points. Retries/replays do not add
frames or samples. Superseded/delayed observations remain in existing raw history
and do not backfill current metric history.

For current runs with failed/invalid/expired collection, record a gap frame, not
values. A missing source, bad encoding, duplicate series key, overflow, wrong
kind or excessive series count records a bounded metric error. Failures for one
metric do not discard the other metrics or reject valid health evidence. A DB
failure still fails the transaction; do not acknowledge a partially stored run.

Table metrics preserve valid present rows when the source table is truncated,
but flag that frame as incomplete. Do not infer absence/recovery for omitted
series. Invalid/missing values break the affected series; duplicate identities
or exceeding declared series bounds invalidate the whole metric for that frame.
There are at most 128 samples across all metrics in one frame. A descriptor whose
declared maximums total more than 128 is rejected at import.

Store finite numeric values within ±18446744073709551615, at most nine fractional
decimal digits. Exact uint64 text stays exact; ordinary floating values may be
rounded to nine fractional digits when materialized, never for health. Values
outside those bounds produce a missing/error sample, not infinity or a clamp.

## Storage and lifecycle

Add one forward migration with two derived tables:

| Table | Minimum contents / identity |
| --- | --- |
| `skill_metric_frames` | Observation ID as primary key and FK with `ON DELETE CASCADE`; host/installation identity, package digest, sample timestamp, recovery epoch, bounded per-metric gap/incomplete/error flags and extraction format 1. |
| `skill_metric_samples` | Frame FK with `ON DELETE CASCADE`; metric key, series key, escaped display label and PostgreSQL numeric value. Primary key `(observation_id, metric_key, series_key)`. |

Identity copies are derived exclusively from the accepted observation, never from
the descriptor. Read original receipt/evidence times, agent generation, settings
revision, enablement version, policy version and interval via its immutable
observation/assignment. Index frames by `(host_id, installation_id,
content_sha256, sampled_at, observation_id)` and samples for the frame/metric/series
lookup. Add the existing schema grants/revocations and size/domain constraints.
No unbounded per-series registry, custom retention job or partitioning scheme is
required for v1.

Successful sample time is `min(finished_at, received_at)`; this bounds the already
permitted small future-clock skew. Invalid-clock/failure gap frames use receipt
time. Retain original timestamps separately in the observation. Order ties by
run sequence then observation ID. The inherited 60-second minimum interval bounds
normal successful per-skill sampling; the read limits below also handle misuse.

Persist the existing observed-history recovery epoch in each frame (nullable if
that facility has never been activated). Operational recovery must rotate that
existing epoch before accepting new evidence, even if change-history capture is
off. It is used for continuity, not to turn metric capture on/off. Do not create
another activation timer or history service for numeric charts.

Observation retention owns deletion: samples and frames cascade when the existing
90-day cleanup removes the parent. Reads filter the parent's first `received_at`
against the same cutoff even before physical deletion. Existing minimal replay
receipts never contain these values or recreate them after expiry. Exact-cutoff
equality remains retained. Historical charts cannot renew contact, clear recovery
latches or restore health. Backup recovery has the same limits as retained readings.

No bulk backfill is part of v1. Old readings and their plain facts remain available;
graphs begin with successfully captured descriptor-bearing readings after the
upgrade. Do not fabricate an earlier graph by applying a new descriptor/formula to
old data. The page explains this start boundary.

## Identity and gaps

A chart identity is host + installation + metric key + declared series key.
The requested digest selects the metric definition, title and unit. Automatically
include retained readings from other versions of that same skill when their
metric has the same value fact/column, resolved unit and table series-key column
(or scalar identity). No opt-in flag or version-number rule is needed.

Numeric encoding, labels, precision, series bounds and widget layout do not alter
already captured numeric values. Changes to the value binding, unit or series
identity exclude incompatible readings. A removed metric is unavailable. Never
merge by display label or mix different skills, hosts or installations.

Authors must give a metric or source a new stable key when its measurement meaning
changes, even if the storage type and unit remain identical. The app cannot infer
an undocumented semantic change from Python code or SQL structure. Keep keys and
units stable when the measurement remains the same.

Original frames/observations retain exact package digests, assignments and values;
reads never rewrite, reconvert or re-evaluate them. The response identifies the
selected digest and a bounded `versions: [{digest, version}]` compatibility set.
This set describes retained definitions considered, not a promise that every
version has samples in the requested window. The chart identifies the selected
version, compatible earlier history when present, and its real earliest reading.

Break continuity on changes to agent identity/generation, recovery epoch,
enablement version, settings revision or host policy version. Also break when:

- an intervening frame reports failure/missing/invalid data for the series;
- table coverage is incomplete between the samples;
- the next reading arrives after the previous reading's evidence expiry;
- the series disappears and later returns, or a retention/version boundary occurs.

No interpolation, carry-forward samples, zero filling or joining across those
breaks. A physical device replaced at the same logical mount path is not claimed
to be the same physical device. Unknown health alone does not create a numeric
gap when the number is valid; show that reading's sampled context separately.

## Operator read API

Add a protected GET under the existing package operator root:

`/api/v2/operator/hosts/{host}/skills/{installation}/metrics/{metric}`

Required query parameters: `from` and `to` (UTC ISO timestamps, inclusive/exclusive
respectively). Optional `digest` defaults to the selected package version;
`buckets` defaults to 240; repeated `series` selects explicit series keys. Reject
unknown, repeated scalar or malformed parameters. Historical views request the
original digest and end at their sampled context; current views end at server now.

| Limit | Value / response |
| --- | --- |
| Window | Positive and at most 90 elapsed days; `to` cannot exceed server now. Valid earlier requests intersect retained evidence and return the applied bounds and retention boundary. |
| Buckets | Integer 1–480; app chooses a sensible value for available chart width. |
| Series | At most 8 explicitly selected series per request. Discover at most 32 in the compatible window. If more exist through churn, require a narrower window or explicit keys; never silently choose a subset. |
| Default selection | Scalar: `scalar`. Table with one series: that series. Multiple: return the bounded series directory and require the app's visible selector; never download every mount chart automatically. |
| Work | At most 150000 eligible frames per request, 2-second DB statement timeout, 512 KiB response, at most 128 retained package definitions considered, and 8 × 480 bucket records. Exceeding a work/output limit returns an explicit `range_too_large`, not partial success. |

Require a live authorized operator session, host/installation membership and an
installed/retained descriptor for the requested digest and metric. Use existing
authorization error conventions and final authority recheck. No guest, package or
agent credential gains this read access. Parameterized queries only; descriptor
keys cannot supply SQL identifiers, predicates or ordering. Use private/no-store
HTTP responses; cancel superseded client reads and bound concurrent chart fetches
to two per page. Query one host/installation/compatible metric at a time. Do not load
raw assessment blobs, all host history or sandbox workers to draw a chart.

Aggregate in SQL over indexed, bounded frames/samples. Never fetch 150000 rows
into JavaScript to resample. Detect the work limit with a bounded candidate scan
before aggregation; do not scan unlimited rows for series discovery or errors.
The app can offer a shorter range when this budget is exceeded. Current widgets
and health remain usable if a graph request fails.

### Response and rendering semantics

The successful response contains `format: 1`, host/installation/digest/metric, the compatible `versions` set,
unit and original catalog title, requested/applied bounds, server `as_of`, retained
cutoff, first available sample time, and the bounded `{key,label}` series directory.
Indicate whether series selection is required. No samples is a successful empty
result, not a fake zero or an assurance of health.

For each selected series return ordered UTC buckets. Each bucket identifies start/
end and has `count`, numeric `min`, `max`, `last`, `last_at`, and flags
`incomplete`, `has_gap`, `connect_from_previous`. Numeric fields are canonical
decimal strings, or null for an empty bucket; counts are JSON integers. A value
of zero remains `"0"`. Include bounded app-owned gap reason codes for evidence,
coverage, context, retention or extraction failures. Error codes never contain
package exceptions, tracebacks, SQL or raw diagnostics.

Choose `last` deterministically by sample time, sequence and ID. No averaging or
summing is implicit: a counter/count chart does not represent events per bucket.
When context changes or a gap falls inside a bucket, keep valid min/max/last but
set `has_gap`; do not draw a connecting line into or out of it. Empty buckets also
break lines. Edge-bucket reads may inspect one bounded preceding frame to decide
continuity, without returning expired/out-of-window samples.

Line/sparkline plots show last plus the min/max envelope so short spikes remain
visible. Historical bar plots show last plus min/max whiskers. Tooltips/table
detail state the bucket duration, sample count, min/max/last and gaps; this is a
summary of readings, not every original reading. History v1 does not overlay
today's thresholds or color an entire trend using today's health. Snapshot meters
still use the exact sampled assignment thresholds.

## Verification boundary

Implementation acceptance covers import/reference validation, exact bytes and
missing values, replay idempotence, failed/table-partial/duplicate series, spike-
preserving aggregation, version/settings/recovery breaks, authorization, bounds,
90-day cascade/read cutoff and response races. Prove a separately authored skill
with a table, meter and history chart works after upload without further app/agent
source changes. Widget appearance and keyboard/narrow-screen behavior are checked
with the same shared components used by the app and public Playbook.

## Planned presentation extension

[Shared skill presentation](skill-presentation.md) specifies the next additive
options and adaptive history response. It is implemented; the existing
contract above remains the currently available behavior.
