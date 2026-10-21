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
1800000000000 with ten minutes of evidence validity. Schema-invalid input fails
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
