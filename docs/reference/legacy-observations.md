# Legacy compiled observations

These contracts remain for host agents without generic package assets. New skills
use the [package SDK](skills/sdk.md). The current five official skills are packages;
adding a check should not extend this fixed recipe lane.

## Authority and immutable assignments

Disk uses `disk_usage.v1`; APT, reboot marker and trim use the compiled
`exec_observe.debian13.v1` policy. Server assignments select only admitted profiles.
They cannot introduce a shell, arbitrary executable, package installation, reboot,
trim or service-control action. OS/architecture and capability checks are enforced
locally as well as by the server; retained enrollment metadata is insufficient.

Assignments pin host, agent, credential generation, definition/policy revisions,
applicability, timeout, cadence and recipe. Both languages use fixture-pinned
canonical digest tuples. Cached not-modified hints require matching retained
identity. Never reconstruct an assignment digest from display labels or assume
that a new default changes an older snapshot's interpretation.

Legacy baseline polling has exactly the fixed package-updates, reboot-required
and fstrim-status records. Execution budgets are 1–30 seconds for the entire
recipe, with 1–4 bounded ordered steps. A profile fixes executable, argv shape,
environment, outputs and process lifecycle. Failed cleanup or exhausted output/time
budgets cannot produce a healthy partial observation.

## Capacity evidence

Disk inventory observes host-visible mounted filesystems through mount metadata
and capacity calls, not file content or raw devices. Kernel/known remote mounts
are excluded; unsupported locality, malformed inventory, topology change and
unreadable mounts stay explicit. Bind mounts/subvolumes remain separate rows and
shared capacity is never summed into a fictitious total.

Read-only local mounts can be informational detail; writable capacity drives
threshold health. No measurable writable mount is unknown. Measurement computes
used as total minus free and percentage against used plus unprivileged available
capacity, with checked integer arithmetic. Byte quantities retain canonical
nonnegative decimal representation; mount IDs identify one inventory, not a
durable cross-run filesystem.

The service's mount namespace matters. Do not add namespace-changing hardening that
hides the host view and then claim complete coverage. Ordinary unprivileged
permissions still apply. Exact selector/parser/budget behavior is owned by
[the disk implementation](https://github.com/TinyWarden/tinywarden-agent/tree/main/internal/host/filesystems)
and [server disk validation](../../server/skills/legacy/disk).

## Typed baseline meaning

| Observation | Evidence and scope |
| --- | --- |
| APT plan | Fixed simulated upgrade command, bounded normalized counts/rows and completeness; never refreshes indexes or proves security coverage |
| Reboot marker | Fixed existence check for `/run/reboot-required`; absence passes only that marker check |
| Trim | Fixed systemd timer/service properties; reported scheduling/completion does not prove physical reclaimed bytes |

Raw command stdout/stderr is transient runner input. Normalizers send only bounded
typed evidence and safe reason codes; they do not forward sensitive package
preambles, arbitrary journal content or raw OS errors. Unsupported presentation,
duplicate/malformed summaries, inconsistent values and missing outputs preserve
uncertainty rather than manufacturing zeros.

Per-run assessment versions preserve historical meaning. Later limited-scope
healthy classification and persistent trim schedule/execution context do not
rewrite older assessments or alter the version-1 wire/digest contract. The server
retains fresh contextual evidence and evaluates against the original snapshot;
the agent does not author the final health label.

## Delivery and compatibility

Durable active/pending work, per-lane sequence, exact request bytes and original
receipts follow the same identity principles as the
[agent protocol](agent-protocol.md). Current authorization, generation, assignment
and evidence gates still apply. Compact receipts survive detail retention.
Compiled collectors do not resume after a host has entered package mode and its
runtime later becomes unavailable.

For decoder tuples and concrete compatibility cases use the
[vendored agent fixtures](../../tests/fixtures/agent),
[baseline assignment source](../../server/skills/assignments/baseline.ts),
[baseline delivery](../../server/skills/assignments/baseline-delivery.ts),
[legacy normalizers/evaluation](../../server/skills/legacy) and the
[Go runner](https://github.com/TinyWarden/tinywarden-agent/tree/main/internal/legacy/runner).
Change both producer and consumer only with explicit compatibility evidence.
