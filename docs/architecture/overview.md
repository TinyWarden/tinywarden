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
