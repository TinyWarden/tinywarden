# Python SDK contract

Define four top-level functions in `skill.py`. The runtime imports code only inside
the isolated guest. Module globals and scratch files do not persist; top-level code
runs on each invocation. Values are JSON-safe and schema-checked. Use the supplied
clocks rather than the guest wall clock.

SDK 3 retains these monitoring functions: scalar packages use the SDK 1 lifecycle,
and packages declaring resource collections use the SDK 2 lifecycle. Independently
authorized operations use the separate [action entry points](actions.md#python-action-entry-points).

| Function | Input | Output |
| --- | --- | --- |
| `validate_settings(settings)` | Complete effective settings | `[]` or up to 64 structured field errors; pure |
| `collect(settings, host)` | Settings and bounded broker | SDK 1 observation, or SDK 2 observation/resources envelope |
| `reduce(context)` | Observation, prior state, settings, identity and clocks | New schema-valid state; pure |
| `evaluate(context)` | Same context with reduction output in `state` | Bounded ordered assessment timeline; pure |

Collection alone receives `host.request(operation, arguments)`. Pure calls have no
broker. Read-only mounts, namespaces, seccomp, process/resource limits and cleanup
are enforced by the platform. Catching a denial does not turn it into permission.

## Public author interfaces

The package-author callable surface consists of these four monitoring functions,
`host.request(operation, arguments)`, the five
[action entry points](actions.md#python-action-entry-points), action context
`read_package(path)`, `check_start()`, `commit(facts)` and optional
[`log(message, level="info")`](actions.md#operation-logging),
[`output(text, stream="stdout")`](actions.md#operation-logging), and
`skill_actions.ActionFailure(reason, facts, effect="none", receipt_json=None)`.
All eight supported broker operations are in [host access](host-access.md).
Runtime supervisor JSON, internal Python modules and Go types are implementation
interfaces, not additional supported imports for skill authors.

## Validation errors

Return an existing schema field and a catalogue message, for example:

```python
return [{"field": "critical_percent",
         "message": {"key": "invalid_thresholds", "params": {}}}]
```

Message parameters must match the catalogue types. Exceptions are execution
failures, not user-facing validation copy.

## Context

Context contains `identity` with installation/content/assignment/generation,
`settings`, `observation`, `previous_state`, `state`, `captured_at`, `received_at`,
`now` and `evidence_expires_at`. Times are UTC milliseconds. `state` is null for
reduce and its output for evaluate. Previous state may be null, reset or pruned.
The engine owns receipt authority, freshness, assignment and replay identity.
SDK 2 adds [resource epochs and evaluation revision](resources.md).

### Reducer memory and monitoring gaps

`previous_state` is durable skill memory, not a currently valid assessment. For
all three SDK versions, pause/resume preserves it while the agent generation, exact
package digest, enablement version and state version remain compatible and the
stored state is inside data retention. A new monitoring epoch alone does not
erase it. An incompatible/reset scope or expired state supplies null. State
remains bounded by the normal schema and size checks.

Resume still requires a fresh observation from an assignment in the new epoch.
Until then current health is Unknown; obsolete reports are discarded, and old
assessments, resource inventories, metric continuity and notification cursors do
not become current. Same-generation sequence/capture ordering and concurrent-state
checks continue across the gap. A collection/runtime failure can retain memory
but cannot renew healthy evidence.

The platform treats state as opaque: it neither guesses historical field names nor
deletes pending expectations during a gap. A skill must use fresh observations
and supplied clocks to reassess remembered executions, failures and deadlines.
A previously expected operation may now be unconfirmed/overdue; retaining memory
does not claim continuous observation or that the operation ran during a pause.
Reboots can remove systemd's execution timestamps without erasing a completion
already remembered by the skill. Existing SDK 1/2 packages use this behavior
without a package change. Data already discarded by an older runtime is not
reconstructed merely by deploying this fix; retained observations remain history.

### Clock contract

All monitoring SDK versions receive a coherent evaluation instant: `now` is the later of
`captured_at` (the agent-reported collection finish) and `received_at` (the app's
receipt time). The platform admits a collection finish up to five seconds ahead
of receipt; a larger lead is `clock_invalid` and never reaches reduction or
evaluation. Skill authors use the supplied `now` without adding clock buffers.
Original observation, capture and receipt timestamps remain unchanged. Inconsistent
timestamps inside an observation still require the skill's normal evidence checks.

Freshness expires at the earlier of capture and receipt plus three check intervals.
The allowance cannot extend freshness. Expired and delayed reports cannot replace
current evidence; sequence, state scope and clock rollback guards still apply.
Retention uses authoritative app time. `received_at` remains the real receipt even
when `now` is slightly later; use receipt for recording when evidence was accepted.
Resource inventory reads, selection and cleanup use the same allowance and earlier
evidence time, so a tolerated future capture is immediately usable and cannot add
freshness or retention time.

The first returned assessment must start at context `now`, as below. After output
validation, the platform makes that initial assessment effective at receipt so an
accepted clock difference cannot create a temporary Unknown. Later absolute
transition times are preserved. Stored/read timelines therefore start at receipt,
while the package output starts at evaluation time. No SDK or package format bump
is required, and existing packages receive this behavior without a package update.

Manual collection has a separate transport deadline. Its five-second allowance is
still needed before the evaluation context exists; agent 0.0.12+ retains the local
90-second execution cap and honors shorter leases. The evaluation clock does not
extend execution, queue, credential or assignment deadlines.

## SDK 1 timeline

Return 1–8 entries. Each has `from`, `status`, `reason` and `facts`. The first starts
at context now; subsequent times strictly increase and precede evidence expiry.
Statuses are `healthy`, `warning`, `critical` and `unknown`. Scheduled entries
interpret the same evidence later; they do not collect a new observation.

```python
return [{"from": context["now"], "status": "warning",
         "reason": {"key": "memory_usage", "params": {"percent": 85}},
         "facts": [{"key": "used", "label_key": "used_label",
                    "kind": "percent", "value": 85}]}]
```

The engine may make a result unknown/stale/ineligible regardless of its returned
status. Never represent absent, unreadable or incomplete evidence as a successful
observation. Timers and long-period maintenance need schedule-aware evidence;
collection cadence alone does not imply the maintenance should run each interval.

## Messages and facts

Catalogue entries have `text` and `parameters`, with string/number/boolean parameter
types. Labels/help are parameter-free. Messages are plain text and escaped.
Rendered message and aggregate error sizes are bounded after substitution.

Facts have unique stable keys and catalogue labels. Up to 64 facts are allowed:

| Kind | Value |
| --- | --- |
| `text` | String up to 1024 characters |
| `number` | Finite JSON-safe number |
| `boolean` | Boolean |
| `percent` | Number 0–100 |
| `duration` | Nonnegative integer seconds |
| `time` | Integer UTC milliseconds, up to 8640000000000000 |
| `table` | 1–12 typed scalar columns, up to 128 rows, explicit `truncated` |

Scalar fields are `key`, `label_key`, `kind`, `value`. Tables instead have `columns`,
`rows`, `truncated`; every row has exactly its declared column keys. Keep exact
large byte counts as numeric text with a declared display encoding. The bounded
assessment timeline is revalidated; HTML, external clickable content and UI code
are unsupported.

## Execution limits

Pure calls have 128 MiB memory, two CPU seconds and five wall seconds. Collection
has 256 MiB, 15 CPU seconds and a manifest wall limit of 1–60 seconds; a
`timeout_seconds` setting can lower that limit. Collection allows 64 broker calls.
Scalar monitoring uses 16 KiB reducer state and 256 KiB aggregate raw broker output.
Resource monitoring uses 64 KiB state and 512 KiB broker aggregate; see its
[budget table](resources.md#budgets). SDK 3 uses the corresponding monitoring
limits based on whether it declares resource collections. Actions have their own
[execution contract](actions.md).
Bounds refer to the runtime's compact ASCII-escaped JSON encoding.

Failures include `runtime_unavailable`, `capability_denied`, `broker_limit`,
`observation_unavailable`, `deadline_exceeded`, `resource_exhausted`,
`execution_failed`, `output_invalid`, `output_exceeded` and `cleanup_failed`.
A failure cannot renew current healthy evidence. SDK tools surface these with a
`runtime:` prefix where applicable. See [author testing](../../build-skills/testing.md).

Executable definitions:
[outcomes](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/contracts/outcomes.py),
[supervisor](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/supervisor.py),
[author fixtures](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/authoring/cases.py).

## Author command reference

Run `python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" COMMAND ...`
after the [SDK quickstart](../../build-skills/quickstart.md). These are all five
author commands; `--help` describes their command-line options.

| Command | Required inputs | Optional flags | Effect |
| --- | --- | --- | --- |
| `init DIRECTORY` | New directory, `--id`, `--publisher` | `--with-actions` | Copy a working monitor, optionally with an inert action; refuses an existing directory |
| `validate SOURCE` | Package directory or ZIP | None | Static admission and metadata summary; does not execute package code |
| `pack SOURCE` | Package directory or ZIP, `--output FILE` | None | Canonical reproducible ZIP and content/archive identity; output must be new and outside the source |
| `test SOURCE` | Package directory or ZIP | `--runtime DIR`, `--cases FILE`, `--action-cases FILE` | Isolated captured monitoring cases plus action value/schema checks; never executes action code |
| `collect SOURCE` | Package directory or ZIP, `--approve-declared-grants` | `--runtime DIR`, `--settings FILE`, `--filesystem-helper FILE`, `--output FILE` | Validate effective settings and perform read-only collection with approved declared grants |

`--runtime` defaults to this kit's verified runtime. Tests default to package
`tests.json` and include `action-tests.json` when present. `--settings` is a JSON
file replacing the default settings for local collection. The filesystem helper
is a trusted agent executable needed by `filesystems.snapshot`; it is not a script
provided by the skill. Collection output, if requested, must be new and outside
the package. Commands emit bounded JSON; failures return nonzero and safe errors.
There is no author-tool command that grants or remotely executes an action.
See [the parser](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/skill_tool.py)
for the exact command-line contract.

### Native action diagnostics

The action context supplies optional `context.log(message, level="info")` and
`context.output(text, stream="stdout")`. The latter records actual command/output/
exit/runtime text; it never executes a command. Agent 0.0.26 captures inherited native
stdout/stderr and runtime tracebacks. Skills own their native operations and must
tee output they redirect for parsing. See the complete [action API and HTTP
contract](actions.md#operation-logging), including bounds,
redaction, older runtimes and diagnostic delivery independent of results.
