# Architecture

```text
Operator browser -- HTTPS --> Next.js control plane --> PostgreSQL
Linux agent ------ HTTPS --> agent API                  ^
                                                       |
                     history / email / retention jobs --+
```

The control plane is a native Next.js process with PostgreSQL 18. Optional bounded
jobs run through native timers. A separate Go binary observes supported Linux hosts
without opening an inbound port. No broker or Docker deployment is required.

## Module ownership

| Module | Responsibility |
| --- | --- |
| `app`, `components` | Pages, shared UI and thin HTTP routes. |
| `messages`, `i18n` | English catalog and typed display-text access. |
| `server/access` | Local administrator, sessions and authorization roots. |
| `server/fleet` | Enrollment, credentials, heartbeat and bulk fleet projection. |
| `lib/skills` | Client-safe skill catalog and settings/display contracts. |
| `server/skills` | Shared defaults, overrides, assignments, readings and assessments. |
| `server/skills/legacy` | Compiled disk/package/reboot/trim recipes, validators and versioned interpretation. |
| `server/history` | Sampled transitions, capture gaps and protected history reads. |
| `server/notifications` | Transition cursors, email outbox and bounded SMTP delivery. |
| `server/db` | Typed PostgreSQL adapter, transactions, target guards and migrations. |
| `server/http` | Bounded transport and request admission. |
| `scripts`, `deploy` | Administrative CLI, verification, release tooling and service templates. |

Use the [file map](codebase-map.md) for exact file roles and
[repository ownership](repositories.md) for the independent agent boundary.

## Application boundaries

UI and HTTP entrypoints call an owning use case. That root validates input,
rechecks authority and owns its transaction, audit event and result. Low-level
modules do not import features. Provider protocols and database representations
remain behind adapters. Operator reads require a fresh session check; background
jobs use guarded local system roots, not fabricated browser sessions.

The [data contract](data.md) selects Kysely, pg and explicit migrations. One local
administrator uses hashed passwords; agent credentials are hashed random authority.
Enrollment consumes tokens atomically. Retries deliberately preserve one immutable
result. [Access](../security/access.md) owns authority and recovery semantics.

## Agent and skills

[Enrollment and heartbeat](agent-protocol.md) use separate lanes from assignments
and results. [Disk definitions](check-definitions.md) and
[disk observations](disk-observations.md) own capacity collection. The agent's
compiled [recipe policy](recipe-execution.md) bounds command authority, execution
and output. [Normalizers](baseline-normalizers.md) convert raw output locally;
raw output is not uploaded. The server evaluates health through
[baseline delivery](baseline-protocol.md) and [observation gates](baseline-observations.md).

[Global enablement](skill-enablement.md) and [field overrides](field-overrides.md)
resolve current policy. Immutable snapshots and per-run assessment versions
preserve historical meaning. Contact freshness and skill freshness are independent.

The selected [installable skill platform](skill-platform.md) separates the engine
from package-owned collection, settings and interpretation. The Python SDK,
native directory admission and generic execution are implemented. ZIP upload and
authenticated package delivery follow separately; see the [package protocol](package-protocol.md).
The agent remains Go and the app remains TypeScript.

## Projections and jobs

[Fleet assessments](fleet-dashboard.md) share current evidence with detail, history
and email. [History](change-history.md) owns sampled transitions and gaps;
[notifications](notifications.md) owns route-scoped delivery state. Neither job is
an authoritative host-action log. [Retention](data-lifecycle.md) removes expired
detail while retaining compact retry receipts and recovery safeguards.

Jobs pin compatible bundles before mutable source is edited. See
[native release](../deploy/native-release.md) for deployment and recovery.
