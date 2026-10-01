# Architecture

```text
Operator browser -- HTTPS --> Next.js control plane --> PostgreSQL
Linux agent ------ HTTPS --> agent API in that control plane
                               |
                               +--> optional provider adapter (later)
```

The initial deployment is one native Next.js process plus native PostgreSQL.
A worker is added only when demonstrated scheduling or notification needs justify it.
No Docker is required. A Go binary runs on supported Linux hosts without an inbound port.

## Current ownership

- `apps/web/app`: thin Next.js routes, layout and informational shell.
- `apps/web/messages` and `i18n`: English catalog and typed access boundary.
- `apps/web/components/ui`: owned shadcn primitives, with upstream notices retained.
- `apps/web/server/access`: local administrator, sessions and root authorization.
- `apps/web/server/fleet`: enrollment, replacement, revocation, heartbeat and fleet reads.
- `apps/web/server/db`: typed PostgreSQL adapter, bounded pool and explicit migrations.
- `apps/web/server/http` and `apps/web/app/api`: bounded transport and thin Next routes.
- `agent/cmd`: executable adapter; `agent/internal/cli`: catalog-backed enroll,
  replace and run commands.
- `infra`: native-service deployment assets; `scripts`: verification automation.
- `docs`: canonical human-facing contracts. See the [file map](codebase-map.md).

P1.B–D add the access, fleet and agent capabilities; there is no background worker.
Create further modules when their behavior exists.
UI/transport entry points
call an owning application use case; it validates input, rechecks authority and
owns the transaction, audit and result. Low-level modules cannot import features.
Provider protocol and database records stay behind adapters.

## First data and protocol direction

Plan stable hosts, host-bound agents, hashed credentials, versioned definitions,
assignments, idempotent observations and audit records. Optional provider links
must not become authoritative host identity. Model enrollment-token consumption
atomically and duplicate heartbeat/result submissions deliberately.

Define UTC instants and one captured reference time per logical operation. Health
freshness is derived from current evidence and explicit grace rules. Definition
revisions preserve historical interpretation. Separate inherited defaults,
historical snapshots and explicit overrides before configurable thresholds ship.

P1's selected [data/migration contract](data.md), [agent protocol](agent-protocol.md)
and [access lifecycle](../security/access.md) define the implementation boundaries.
They select Kysely + pg and Kysely migrations, with one local administrator and
hashed random agent authority. P1.B implements the access and new-host enrollment
slice; P1.C implements the agent client, heartbeat and inventory view; P1.D adds
credential lifecycle and native recovery.
Release-wide retention remains a P4 decision.

P2's selected [definition contract](check-definitions.md) assigns policy resolution,
immutable snapshots and authorized edits to `server/checks`, introduced in P2.A.
The [disk observation contract](disk-observations.md) owns collection and
server-derived health in P2.B. Fleet exposes a transaction-scoped credential guard
reused by heartbeat and assignment fetch. No background worker is introduced.

P3's selected [execution contract](recipe-execution.md) assigns compiled command
policy and bounded process evidence to `agent/internal/runner`, introduced in
P3.A. It has no credential or transport dependency. Existing `agent` scheduling
and `server/checks` integrate the [baseline observation boundary](baseline-observations.md).
P3.B introduces `agent/internal/baseline` for fixed recipes and normalized evidence,
and pure validators/evaluators in `server/checks`; [baseline normalizers](baseline-normalizers.md)
owns their exact formats. Raw output stops at the agent normalizer; only the
server evaluates health. No transport or scheduling dependency is introduced.
This design introduces no new server process or independently installed helper.

## Connected P3 slice

P3.C integrates the runner/normalizers through separate baseline fetch, async
worker and upload lanes in `agent/internal/agent`, with heartbeat priority and
one retained runner slot. `server/checks` owns authorized recipe/policy revisions,
immutable delivered snapshots, exact retry results and current/historical health.
[Baseline integration v1](baseline-protocol.md) owns additive storage and wire
shapes. Fleet views expose three scoped observations and inheritance/override
editors using shared field/toggle/button primitives. This introduces no additional
server process or arbitrary execution facility. Local implementation and VM proof
precede the separately authorized [single-checkout upgrade](../deploy/p3-live-upgrade.md).


## Selected P4 notification boundary

The [notification contract](notifications.md) selects a bounded local job in
`server/notifications`, using transaction-scoped summaries owned by checks/fleet.
Operator reads retain their authorization and fresh session recheck. A local system
root owns transition/outbox/audit transactions and a narrow SMTP adapter; it exposes
no system HTTP endpoint. Implemented locally; activation is pending. P4.C owns opt-in native job
packaging; no broker or extra serving deployment is introduced.
