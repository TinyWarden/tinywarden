# Test a skill

Static validation checks package structure and metadata without executing Python.
Captured-observation tests execute the real pure functions in the supported sandbox.
Real collection additionally uses the declared read-only host broker. Each answers
a different question; passing static validation does not prove behavior or safety.

## Captured observations

Put `tests.json` at the package root, or pass `test --cases /absolute/cases.json`:

```json
{
  "format": 1,
  "cases": [{
    "name": "High memory warns",
    "observation": {"total_bytes": "1000000", "available_bytes": "150000", "used_percent": 85},
    "expect": {"state": {}, "statuses": ["warning"]}
  }]
}
```

There are 1–32 uniquely named cases. Optional `settings` defaults to manifest
settings. Optional inputs are `previous_state`, `captured_at`, `received_at`, `now`
and `evidence_expires_at`. Times are UTC milliseconds; the default fixed now is
1800000000000 with ten minutes of evidence validity from the earlier of capture and
receipt. The author tool normalizes evaluation time to the latest of `now`, capture
and receipt, matching the [SDK clock contract](../reference/skills/sdk.md#clock-contract).
An explicit later `now` supports future schedule-boundary tests. A capture more
than five seconds ahead of receipt fails fixture setup as `fixture_clock`.
Test ordinary time comparisons directly; packages need no platform-skew buffer.
Schema-invalid input fails
fixture setup. Successful validation needs an observation and an assertion on
state, statuses or the exact timeline.

`expect.errors` compares structured field errors. A nonempty error expectation
tests only validation. Otherwise errors must be empty, reduce runs, its output
becomes evaluate's state, and `state`, ordered `statuses` and/or `timeline` are
compared exactly. Fixtures cannot bypass reduction by supplying its result.
For SDK 2, statuses are flattened from subjects in timeline order; optional
`resource_epochs` and `evaluation_revision` test membership and context changes.

Test threshold boundaries, malformed/partial observations, missing optional data,
invalid settings, fresh/expired evidence, previous-state reset and version limits.
For time-dependent skills include an agent clock ahead of receipt, delayed delivery
and schedule boundaries. The tool supplies the platform clock; assertions on exact
package timelines start at evaluation time. The app applies the first result at
receipt while preserving later absolute transitions.

For stateful skills, supply remembered state alongside a fresh observation after a
monitoring gap. Check that historical results survive, while unreadable evidence
stays Unknown and real failures still warn. Test a pending deadline that elapsed
during the gap and state older than retention. Also test null state: a new agent
generation, package/reset or expired state may start without history. Saved memory
does not prove continuous observation; see the [memory contract](../reference/skills/sdk.md#reducer-memory-and-monitoring-gaps).

Systemd collection uses UTC even on servers in another timezone. Test canonical
UTC text, Unix/fractional timestamps, empty timestamps and malformed values. Do not
add local abbreviation tables or clock allowances to individual skills. A timer's
last trigger and a default success result cannot substitute for execution evidence.
Resource skills also need empty selection, independent targets, missing selected
results, membership changes and interrupted continuity. The
[example targets package](examples/targets/README.md) includes three runnable cases.

## Execution commands

Use the delegated `systemd-run` command from [the tutorial](quickstart.md) with
absolute SDK/package paths. `test` accepts either a directory or ZIP. It has no
host access. A runtime failure stops the case sequence and returns nonzero.

For `collect`, inspect capabilities and pass `--approve-declared-grants`. Optional
`--settings` reads effective settings JSON. `filesystems.snapshot` also needs
`--filesystem-helper` pointing to an existing trusted host-agent binary. No rebuild
is needed. Missing helpers and unavailable isolation are failures, not skipped
success. Never replace SDK execution with a direct import of untrusted `skill.py`.

Keep captured observations free of credentials, host identifiers and unrelated raw
output. Include only normalized fields required by the schema. Preserve explicit
truncation/completeness and unavailable reasons.
