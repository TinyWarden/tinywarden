# Installable skill platform

Status: SDK v1 runtime, ZIP installation and generic app/agent interfaces
are implemented. Four official skills are Python packages; compiled protocols
remain available for existing agents that have no platform assets installed.
ZIP upload, permission review and authenticated exact-version delivery are available.
[Package format](skill-packages.md) and [runtime boundary](skill-runtime.md) define
the target; existing contracts remain authoritative until migration is verified.

## Extension boundary

A new skill using the published runtime and capabilities must install without
changing app or agent source, rebuilding either product, adding a route, changing
a database constraint, or adding a compiled command profile. Packages own
collection, interpretation, settings, display metadata and remembered state.
The engine owns authority, scheduling, transport, persistence and presentation.

The package runtime is Python 3.13 with its standard library and a versioned
TinyWarden SDK. Authors edit source and create a ZIP; no compiler, pip, package
installation hooks or dependency downloads are involved. Pure Python helper files
may be included. Native extensions and bundled executables are unsupported.
Python itself provides no security isolation; the runtime boundary described below
is mandatory before any package execution.

New capabilities or runtime versions can require a platform release. An ordinary
skill within the published interface cannot. Unsupported packages are identified
before activation, never accommodated by silently increasing permissions.

## Package functions

The trusted launcher dispatches four functions from `skill.py`. Arguments and
results are bounded JSON values. Package modules never load into the web process.

| Function | Runs on | Responsibility |
| --- | --- | --- |
| `validate_settings(settings)` | Control plane sandbox | Return field/message-key errors for cross-field rules after structural validation. |
| `collect(settings, host)` | Agent sandbox | Use granted SDK observations; return typed observation data or a bounded unavailable result. |
| `reduce(context)` | Control plane sandbox | Derive bounded next state from a new observation and previous state. No I/O. |
| `evaluate(context)` | Control plane sandbox | Produce health, reasons, display facts and any future time transitions. No I/O. |

Contexts include exact package/settings identity, typed observation, captured UTC
times and engine-owned scope. Reduction sees the previous state; evaluation sees
the resulting state, `now` and engine-calculated evidence expiry. Package clocks
and random values are not authoritative. Conformance requires deterministic output
for the same input. No executable settings expression or database access exists.

An assessment is a bounded timeline, beginning at `now`, of at most eight ordered
entries `{from, status, reason, facts}`. Status is healthy, warning, critical or
unknown; reasons reference package catalog keys with typed parameters. Future
entries must be strictly later and no later than evidence expiry. The last entry
continues only until that expiry. The engine selects the applicable entry without
executing package code on page reads or in email/history jobs.

This lets a weekly trim skill describe waiting, grace and overdue states from one
fresh observation. It does not give the package control over freshness. Contact,
generation, recovery, assignment, enablement and expiry gates always dominate a
package's claimed health. Disabled and not-applicable are separate engine states.

## State, settings and results

- Settings retain explicit per-field overrides: customized fields stay fixed;
  inherited fields follow later defaults. Revisions identify concurrency and
  immutable evidence; they are not a user-facing rollback feature.
- Validate the complete effective settings before saving any affected default or
  override. Package validation occurs outside database locks. The commit rechecks
  authority, revision and package identity and rejects a changed precondition.
- State is at most 16 KiB, schema-validated and scoped to installation, host,
  credential generation, package/state version and compatible assignment scope.
  It survives process/host restarts, not arbitrary scope changes. It expires under
  the engine's existing 90-day retention policy; packages cannot extend retention.
- Only a newer accepted observation can advance current state. Delayed readings
  may be retained as historical evidence but cannot replace newer current state.
  Exact retries return the original receipt without reducing state again.
- Reduction/evaluation run outside SQL locks. A short transaction rechecks scope,
  sequence and state version, then stores the observation, state, assessment,
  receipt and audit result atomically. A changed state cursor permits at most two
  reevaluations; further contention returns a retryable result without partial work.
- Historical records retain their original assessment, package digest and display
  catalog identity. New package code never reinterprets old history. Retention may
  remove detail while keeping the existing compact idempotency/recovery receipts.

Facts use standard, escaped components: scalar text/number/boolean/duration/time,
percent and bounded tables. Packages supply English message keys, units and field
metadata, not HTML, JavaScript, CSS or React. The shared renderer supplies accessible
settings controls, summary/detail views and future translation fallback. Email uses
approved summary/reason fields only; raw output and detailed facts stay out of mail.

## Generic persistence and delivery

Introduce additive storage for immutable packages, installations, settings,
assignments, observations, assessments and state. Package/install IDs are database
values, not SQL enums/checks enumerating skills. Generalize history and notification
subject identity once, including critical status for any skill. Existing migration
files and old history IDs remain unchanged. Schema upgrades are platform work;
installing another package cannot require a migration.

An installation selects one package version globally in the first implementation.
Assignments pin digest, resolved settings, policy/enablement revision and credential
generation. Agent capability advertisement is conditional on runtime readiness.
New versioned assignment/result/package endpoints coexist with the current lanes;
unsupported agents keep existing compiled skills and report package incompatibility.

Authenticate before returning package metadata or bytes. Agents download only from
their configured HTTPS control-plane origin, with redirects disabled, bounded
transfers and digest verification before cache publication or execution. Package
content cannot supply a download URL. Transfers do not block priority heartbeat.
Queue identities include installation and credential scope; preserve durable retry
bytes, monotonic sequences and existing identity/state across upgrades.

Updates require explicit version selection and permission review. Changed schemas
must preserve existing field identities/types and validate all effective settings;
incompatible updates are rejected with the old version active. No arbitrary package
upgrade hook runs. State resets on package change in v1, except for the verified
one-time import of existing built-in state. Record this gap without a false recovery.
Disable, uninstall, generation change and version change invalidate affected pending
work/notifications; they neither delete history nor masquerade as host recovery.

## Existing skills and migration

Keep `disk-local`, `package-updates`, `reboot-required` and `fstrim-status` as stable
compatibility identities. Preserve all current settings, explicit override masks,
global switches, results, unknown/limited-assurance meanings and trim context across
restarts. Legacy assessment versions and protocol readers remain available for
historical data and installed old agents. Only one execution lane owns a given
host/skill at a time; switching lanes is an explicit assignment transition.

The compiled implementations are extracted behind a registry without schema,
protocol or behavior changes. Shared editors live in `components/skills`; settings
and server page components live beside their routes. The agent separates protocol
types and disk/package/reboot/trim collectors from its identity/transport engine.
The next step is to implement the runtime and convert the four packages,
including an importer for existing trim state. Keep legacy adapters for compatibility.
Prove an independently authored fifth skill with unchanged app/agent source and
binary hashes before exposing upload/distribution. The proof covers settings,
overrides, readings, display, history, alerts, disablement and an agent restart.

## Source ownership and target folders

Keep the app at the repository root and preserve current routes. This is an
ownership change around skills, not a repository-wide cosmetic rename.

| Target | Owns |
| --- | --- |
| App `lib/skills/` | Client-safe identifiers, schema/value types and presentation contracts; no secrets or server imports. |
| App `server/skills/catalog/` | Registry and installation lookup; no duplicated catalog per consumer. |
| App `server/skills/settings/` | Defaults, override intent and effective-settings resolution. |
| App `server/skills/assignments/`, `results/` | Authority, delivery, admission, state, freshness and assessments. |
| App `server/skills/legacy/{disk,packages,reboot,trim,shared}/` | Four compiled adapters and old protocol/storage/assessment compatibility. |
| App `server/skills/runtime/` | Package validation, sandbox supervision and immutable artifact loading. |
| App `runtime/skills/` | Trusted launcher/SDK/seccomp assets, included in release manifests. |
| App `components/skills/` | Reusable schema-driven controls and result renderers. |
| App `app/<route>/_components/` | Page-specific skill UI; genuinely shared operator/brand UI stays shared. |
| App `tests/skills/` | Affected tests grouped by settings, assignments, results, runtime and legacy behavior. |
| Agent `internal/skills/{protocol,packages,runtime,broker}/` | Generic package transport/cache, execution and granted host operations. |
| Agent `internal/skills/builtin/{disk,packages,reboot,trim}/` | Existing compiled collectors/normalizers during migration. |
| Agent `skills/official/`, `sdk/python/` | Independently packaged official skill source and author SDK/conformance fixtures. |

Agent identity, durable transport/state and heartbeat stay in `internal/agent`;
skill modules do not import that orchestration layer. The legacy runner remains
separate until its callers migrate. App history, notifications and fleet consume
the shared skill projection, never switches over a growing list of skill IDs.

Create folders when they gain an owner, not as empty scaffolding. Move only touched
UI/tests; retain unrelated names. Official package source lives in the agent
repository but is released independently of the Go binary. The app consumes pinned
artifacts/SDK fixtures and builds without a sibling checkout. Native job bundles
must pin launcher, policy and catalog assets as well as TypeScript; no job may
reach into mutable runtime source after deployment.
