# Package, reboot and fstrim observation boundary

P3.1 integration constraints selected 2026-09-29. This document owns the minimum
boundary for P3.B recipes and P3.C delivery/results. P3.B's exact local shapes,
formats, fixtures and evaluators are defined in [baseline normalizers](baseline-normalizers.md).
P3.C's exact wire/digest/schema and private state are in [baseline integration v1](baseline-protocol.md),
defined before those interfaces are used. P3.A's executable contract is in
[recipe execution](recipe-execution.md); existing disk behavior stays governed by
[check definitions](check-definitions.md) and [disk observations](disk-observations.md).

## Fixed baseline and observable meaning

Initial definitions are `package-updates`, `reboot-required` and `fstrim-status`.
Use Debian 13/amd64 and capability `exec_observe.debian13.v1`. Missing tools,
unsupported systems, parser mismatch, failed execution and incomplete evidence
are explicit unknown states. A host must not receive a healthy baseline merely
because its agent reports recent contact.

The initial global polling interval is 3600 seconds for each baseline, with
three intervals of observation grace and a 30-second maximum recipe budget.
This is an initial implementation default, editable centrally from 300..86400
seconds; no new host action or external notification follows from it. Standard
recipe timeouts start at 30 seconds for packages and 10 for reboot/fstrim.
Use one definition per required baseline, no user-created scripts or arbitrary
commands. Group policy remains deferred. Inherited settings follow later global
revisions; complete host overrides pin their source revision, as in P2.

| Definition | Initial recipe | Evidence and interpretation limits |
| --- | --- | --- |
| `package-updates` | One `apt-upgrade.v1` step, argv `["--simulate","upgrade"]` | Normalize upgraded, newly installed, removed and held-back counts from the tested C-locale APT format. Report that this is a plan from locally cached metadata. Pending upgrades/held-back packages warrant attention; zero counts alone do not prove current repository freshness or absence of security updates. No security-update count is inferred. |
| `reboot-required` | One `reboot-marker.v1` step | Exit 0 is a present package reboot marker and warrants attention. Exit 1 means no marker was observed, not proof that every running kernel/library is current. Unless a verified producer/completeness condition is established, absence is informational with unknown overall reboot assurance. Other exits/signals are unknown. Do not automatically reboot or install a detector. |
| `fstrim-status` | `fstrim-timer.v1` then `fstrim-service.v1` | Observe scheduling, condition state and available recent service outcome. Missing/inapplicable units, skipped conditions or unavailable history must be explained. A default `Result=success` without a real start/exit timestamp is not a successful trim. A timer trigger is not proof the service ran successfully. |

For packages, use strict bounded parsing; do not derive zero by counting absent
lines. Require exactly one recognized complete summary, checked nonnegative
counts and supported execution outcome. Never parse raw stderr as package data.
An inaccessible/empty cache, inconsistent before/after state or unknown cache
freshness cannot become an unqualified “up to date”. P3.B owns an explicit
freshness field/reason and conservative evidence rules; no index refresh is
implicitly authorized. Local administrators continue to own APT refresh policy.

For reboot, `/run/reboot-required` is an optional distribution/package signal,
not a universal Debian reboot API. For fstrim, systemd properties describe its
visible runtime state, which can be lost across boots or unit garbage collection.
Require matching unit IDs and recognized timestamps/states; timer/service reads
are not atomic, so inconsistent or changing evidence is unknown. A successful
fstrim invocation can skip unsupported devices and does not prove physical space
reclamation. The check never invokes `fstrim` itself or changes its timer.

Parse systemctl output by property name, not requested order. Debian 13's
`--timestamp=unix` applies to some properties while timer `*USec` values can
still use the C-locale UTC date form; P3.B fixtures must handle those specific
forms and empty values explicitly. `ConditionResult=no` with no condition
timestamp is unevaluated evidence, not proof of a failed/skipped execution.

P3.B records a versioned normalizer/evaluator for each recipe, including exact
field ranges, accepted formats and failure reasons. Normalizers extract evidence
on the agent; only the server classifies health. Positive attention evidence can
remain visible alongside unknown completeness. No raw process output, repository
URLs, arbitrary unit properties or full package inventories enter observations.

## Versioning, authorized edits and delivery

Server `checks` remains the owner of definition/policy mutations, revision
validation, delivery and evaluation. Use the existing operator guard and typed
audit boundary. A centrally supplied recipe must pass the same profile/argument
rules as the agent, and reference a supported normalizer/evaluator combination.
Do not expose a generic JSON/command editor; initial controls select supported
recipe options, cadence/timeout and inheritance. Any central command-profile
edit is privileged, optimistic, idempotent and audited with old/new revision IDs.

Keep P2's disk endpoint/cache/schema meaning intact during upgrade skew. Add
separate baseline assignment and run endpoints under `/api/v1/agent`, plus
separate bounded local cache/sequence/queue files. Do not silently broaden the
strict P2 disk assignment or reset P1 identity. No executable capability is
advertised until its policy, recipes and scheduler actually work.

P3.C's additive migration introduces baseline definition/revision, policy/revision,
delivered snapshot, receipt and run records with typed host/agent/generation and
revision references. Disk migrations 001–005 are immutable. New data may use
validated bounded JSON for ordered argv/typed observation values, but identity,
authorization, revision ordering, relationships and uniqueness use typed columns
and constraints. No arbitrary JSON is interpreted as execution authority.

The integration must implement these invariants together:

1. Immutable revisions and delivered snapshots preserve the complete recipe,
   parser/evaluator version, effective cadence/timeout and inherited/override
   provenance. Same-value override saves keep their original pin; explicit return
   to inheritance follows the current head. Store neither derived current health
   nor a mutable copy of historical interpretation as authoritative state.
2. Operator mutation roots recheck session/authority after locks and persist
   revision, typed audit and idempotency receipt atomically. Acquire baseline
   definition locks in stable key order, before host → agent → credential →
   policy. Baseline paths must not acquire disk-definition locks after host locks.
   Keep transactions free of host execution and remote I/O.
3. Fetch authenticates the existing host-bound agent credential and generation.
   Resolve all three baseline assignments in one bounded response; independent
   applicability remains visible. Authenticate before using any known-cache hint.
   Bind cache/digest to origin, host, agent, generation, definition, delivery and
   full recipe content. Canonical digest encoding is fixed and tested before
   implementation, including ordered step/argv arrays and all effective values.
4. Unchanged payload omission needs an exact saved identity/revision/digest for
   that definition. Reject equal-revision identity changes and server regression.
   A missing retained current-generation snapshot commits a baseline recovery
   latch before returning conflict. That latch blocks current baseline health
   and cache renewal even when the client later sends no known assignment.
   Explicit credential replacement and fresh delivery/results recover authority.
5. The local baseline cache has a maximum 24-hour validated lease; terminal
   assignment faults durably pause it. Recheck scope, local capability and lease
   before recipe launch and cap its execution context by the remaining lease.
   Backward time invalidates the lease. Capture a recipe
   snapshot before execution; a newer fetch cannot change a running recipe.
6. Persist generation-local run identity/sequence before launch. Upload only
   typed observation evidence and bounded execution outcomes tied to that exact
   snapshot. Unique run ID and `(agent,generation,sequence)` plus a canonical
   digest make authorized exact retries idempotent; changed retries conflict.
   Unknown/wrong-host/wrong-generation references never fall back to current
   settings. Collection or upload cannot renew heartbeat freshness.
7. Current health needs current heartbeat/generation, no recovery latch, today's
   resolved recipe and complete fresh execution/evidence. A new default or policy
   invalidates previous-source current health immediately. Higher accepted run
   sequence wins even if its result is unknown; older healthy uploads cannot
   hide a newer failure. Immutable history uses its own snapshot and evaluator.
8. Apply P2's conservative time rules: earlier of finished_at and first receipt
   anchors freshness; over 30 seconds future skew or backwards time is unknown;
   stale at age >= three intervals. Delayed retries never become fresh merely
   by arriving. Package-index freshness and command-run freshness are separate.

Initial transport limits: 16 KiB assignment request, 48 KiB baseline assignment
response/cache and 32 KiB typed run request. These are endpoint-specific;
P1/P2 limits do not change. A recipe is at most 8 KiB and a response contains
exactly the three known baseline keys, not an unbounded general check list.
Reject duplicate keys/steps/IDs, unknown input fields and incompatible versions.

## Scheduling, buffering and upgrade

After P3.C integration, heartbeat retains priority; baseline fetch is independently
due every 60 seconds with existing bounded retry/Retry-After behavior. One recipe
may execute at a time. Rotate among due baseline keys fairly; missed intervals
produce one new run, not catch-up history. A busy/unreaped runner defers launches
without allocating an unbounded queue or new run every scheduler tick. Once a run
has started, record its failure/unknown outcome instead of silently erasing it.

Keep baseline pending results to 100 runs/1 MiB combined, in addition to P2's
100 runs/8 MiB disk queue. Preserve the ambiguous in-flight upload byte-for-byte;
discard oldest other completed baseline results on overflow with a drop count.
Only one baseline upload is in flight. Persist mode-0600 files atomically under
the existing state lock. Corruption/terminal conflict pauses that lane; 401 stops
all authenticated work and cancels active recipes. Terminal assignment faults
also cancel recipe work and pause its lease durably. No invented credential or
automatic state deletion.

P3.C must define and test exact schemas and compatibility before connecting the
runner. Old servers returning no baseline endpoint leave P1/P2 working; old agents
do not claim P3 capability and never receive command work through the disk endpoint.
Code rollback may leave additive baseline tables and private files, but cannot
reset sequence, accepted authority, audit or ambiguous requests. Live migrations,
build/restart and VM upgrade remain separate release actions with the established
single-checkout procedure and local recovery artifacts.

Primary evidence:
[APT simulation](https://manpages.debian.org/trixie/apt/apt-get.8.en.html),
[APT cache freshness](https://manpages.debian.org/trixie/apt/apt-cache.8.en.html),
[package reboot signals](https://manpages.debian.org/trixie/debian-goodies/checkrestart.8.en.html),
[systemctl runtime properties](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html),
and [fstrim limits](https://manpages.debian.org/trixie/util-linux/fstrim.8.en.html).
