# Codebase map

Generated inventory from Git; authored roles live in `scripts/map-roles.json`.
Run `node scripts/codebase-map.mjs --write` after staging added/removed paths.

`apps/web` owns the web shell; `agent` owns the CLI; `infra` owns service assets;
`scripts` owns local gates; `docs` owns human-facing contracts. The web API owns operator access and initial enrollment.

| Tracked path | Role |
| --- | --- |
| `.editorconfig` | Editor whitespace and encoding conventions. |
| `.github/workflows/phase-closeout.yml` | Explicit phase-closeout GitHub verification; no automatic per-change triggers. |
| `.gitignore` | Version-control exclusions for secrets, build output and local artifacts. |
| `.npmrc` | Exact dependency saves; automatic install audits disabled for phase-end cadence. |
| `.nvmrc` | Supported Node LTS major. |
| `CONTRIBUTING.md` | Contributor workflow, acceptance, localization and publication conventions. |
| `LICENSE` | Apache-2.0 license for original project material. |
| `README.md` | Project status, local startup and canonical documentation entry points. |
| `THIRD_PARTY_NOTICES.md` | Preserved MIT notice for copied shadcn UI component source. |
| `agent/README.md` | Agent build, enrollment, run and private-state instructions. |
| `agent/cmd/tinywarden-agent/main.go` | Process entry point delegating to the CLI boundary. |
| `agent/go.mod` | Agent module identity and supported Go toolchain floor; no external dependencies. |
| `agent/internal/agent/agent_test.go` | TLS client, replay and private-state recovery tests. |
| `agent/internal/agent/config.go` | Strict configured HTTPS origin and local state-path validation. |
| `agent/internal/agent/protocol.go` | Bounded versioned enrollment and heartbeat HTTPS client. |
| `agent/internal/agent/protocol_status_test.go` | Interrupted response status and header precedence regressions. |
| `agent/internal/agent/protocol_test.go` | Bounded HTTP response, Retry-After and cancellation tests. |
| `agent/internal/agent/replacement.go` | Durable operator-token credential replacement and saved replay recovery. |
| `agent/internal/agent/replacement_test.go` | Durable replacement retry and resumed heartbeat tests. |
| `agent/internal/agent/run.go` | Debian metadata, durable enrollment and bounded heartbeat scheduling. |
| `agent/internal/agent/state.go` | Private locked state storage for enrollment, replacement and heartbeat replay. |
| `agent/internal/agent/state_recovery_test.go` | Legacy pending-request upgrade, version-stable replay and interrupted heartbeat recovery tests. |
| `agent/internal/cli/cli.go` | Catalog-backed version, enrollment and run dispatch. |
| `agent/internal/cli/cli_test.go` | Proves unsupported operations cannot report success or emit output as results. |
| `agent/internal/cli/en.json` | English CLI message catalog embedded into the executable. |
| `apps/web/.env.example` | Non-secret local origin, database and limit configuration example. |
| `apps/web/.npmrc` | Exact dependency saves; automatic install audits disabled for phase-end cadence. |
| `apps/web/README.md` | Web package boundaries and development commands. |
| `apps/web/app/api/v1/agent/enroll/route.ts` | Public agent enrollment route wired to the bounded handler. |
| `apps/web/app/api/v1/agent/heartbeat/route.ts` | Credential-scoped agent heartbeat route. |
| `apps/web/app/api/v1/operator/agents/[id]/revoke/route.ts` | Guarded operator agent-revocation route. |
| `apps/web/app/api/v1/operator/enrollment-tokens/[id]/revoke/route.ts` | Guarded operator token-revocation route. |
| `apps/web/app/api/v1/operator/enrollment-tokens/route.ts` | Guarded operator token-issuance route. |
| `apps/web/app/api/v1/operator/hosts/[id]/route.ts` | Guarded single-host contact projection route. |
| `apps/web/app/api/v1/operator/hosts/route.ts` | Guarded paginated host inventory route. |
| `apps/web/app/api/v1/operator/login/route.ts` | Local administrator login route. |
| `apps/web/app/api/v1/operator/logout/route.ts` | Guarded administrator logout route. |
| `apps/web/app/api/v1/operator/session/route.ts` | Administrator session-state route. |
| `apps/web/app/fleet/[id]/page.tsx` | Guarded host detail and honest contact/health evidence. |
| `apps/web/app/fleet/fleet-client.tsx` | Visible-tab fleet polling, pagination and responsive contact view. |
| `apps/web/app/fleet/page.tsx` | Guarded fleet page and unavailable state. |
| `apps/web/app/globals.css` | Shared semantic color, typography and focus tokens; Tailwind entry point. |
| `apps/web/app/layout.tsx` | HTML locale, catalog-backed metadata and keyboard skip link. |
| `apps/web/app/login/page.tsx` | Catalog-backed local administrator login form. |
| `apps/web/app/not-found.tsx` | Catalog-backed missing-page surface and working return-home link. |
| `apps/web/app/page.tsx` | Informational public entry point and guarded dashboard navigation. |
| `apps/web/components.json` | shadcn registry, component ownership and alias configuration. |
| `apps/web/components/ui/badge.tsx` | Shared upstream shadcn badge primitive and visual variants. |
| `apps/web/components/ui/card.tsx` | Shared upstream shadcn card layout primitives. |
| `apps/web/eslint.config.mjs` | Supported TypeScript, Next and hooks lint rules with semantic checks. |
| `apps/web/i18n/messages.ts` | Typed English catalog access and the single enabled locale. |
| `apps/web/messages/en.json` | Application-owned English visible copy, accessible labels and metadata. |
| `apps/web/next.config.ts` | Next server configuration and disabled framework UI indicators. |
| `apps/web/package-lock.json` | npm dependency lockfile; generated by npm. |
| `apps/web/package.json` | Web package scripts, dependency versions and runtime constraints. |
| `apps/web/postcss.config.mjs` | Tailwind PostCSS build integration. |
| `apps/web/scripts/operator.ts` | Catalog-backed terminal-only administrator initialization and reset commands. |
| `apps/web/server/access/audit.ts` | Transactional application audit inserts. |
| `apps/web/server/access/operator.ts` | Local administrator initialization, login, reset and durable login limits. |
| `apps/web/server/access/password.ts` | Bounded scrypt hashing, verification and password policy. |
| `apps/web/server/access/session.ts` | Opaque cookie sessions, expiry, logout and concurrency cap. |
| `apps/web/server/config.ts` | Strict runtime origin, database and request-limit configuration. |
| `apps/web/server/db/client.ts` | PostgreSQL pool and typed Kysely adapter. |
| `apps/web/server/db/migrate.ts` | Explicit owner-checked migration command. |
| `apps/web/server/db/migrations/001_initial.ts` | Initial constrained access, host, agent, token, credential and audit schema. |
| `apps/web/server/db/migrations/002_audit_target_agent.ts` | Additive audit target-agent foreign key and index migration. |
| `apps/web/server/db/types.ts` | Typed database rows and PostgreSQL value mappings. |
| `apps/web/server/errors.ts` | Stable application error codes and safe status mapping. |
| `apps/web/server/fleet/enrollment.ts` | One-time new-host enrollment, credential replacement and bounded replay handling. |
| `apps/web/server/fleet/heartbeat.ts` | Credential-scoped atomic sequence and contact update. |
| `apps/web/server/fleet/inventory.ts` | Authorized paginated list/detail contact projections. |
| `apps/web/server/fleet/revocation.ts` | Operator-authorized agent/credential revocation under shared locks. |
| `apps/web/server/fleet/tokens.ts` | Operator new-host/replacement token issuance, retry and revocation. |
| `apps/web/server/http/handlers.ts` | Thin versioned operator and agent HTTP actions. |
| `apps/web/server/http/response.ts` | Bounded JSON parsing, origin guard and safe HTTP response boundary. |
| `apps/web/server/validation.ts` | Exact versioned request and identifier validation. |
| `apps/web/tests/messages.test.ts` | Validates nonempty plain-text catalog leaves. |
| `apps/web/tests/operator-tty.py` | Synthetic terminal harness proving passwords remain hidden. |
| `apps/web/tests/p1b.boundaries.test.ts` | P1.B boundary, expiry, concurrency and authorization acceptance cases. |
| `apps/web/tests/p1b.cli.test.ts` | P1.B terminal-only administrator command acceptance cases. |
| `apps/web/tests/p1b.integration.test.ts` | P1.B transactional access and enrollment acceptance cases. |
| `apps/web/tests/p1b.migrations.test.ts` | P1.B migration, ownership and SQL constraint acceptance cases. |
| `apps/web/tests/p1c.server.test.ts` | P1.C heartbeat, scope, pagination, freshness and read-failure acceptance cases. |
| `apps/web/tests/p1d.audit.test.ts` | Audit actor, target and action-shape validation cases. |
| `apps/web/tests/p1d.lifecycle.test.ts` | P1.D replacement, revocation, race and audit-rollback acceptance cases. |
| `apps/web/tests/p1d.session-timing.test.ts` | Held-lock session expiry, idle timeout and clock-regression acceptance cases. |
| `apps/web/tsconfig.json` | Strict web TypeScript and bundler-resolution contract. |
| `apps/web/vitest.config.ts` | Focused web unit-test discovery. |
| `docs/README.md` | Canonical document ownership and navigation index. |
| `docs/architecture/agent-protocol.md` | P1 versioned enrollment/heartbeat wire, retry, idempotency and contact-state contract. |
| `docs/architecture/codebase-map.md` | Generated exhaustive Git inventory with authored non-obvious roles. |
| `docs/architecture/data.md` | P1 capability, schema, transaction, operator API and migration-tooling contract. |
| `docs/architecture/overview.md` | Module ownership, dependency direction and future trust boundaries. |
| `docs/deploy/configuration.md` | P1 origin, database, cadence, agent-state and request-limit configuration contract. |
| `docs/deploy/native.md` | Native release/service/configuration contract and activation decision gates. |
| `docs/development/master-plan.md` | Sole phase/task/batch roadmap, model-switch checkpoints, dependencies and acceptance criteria. |
| `docs/development/p1-acceptance.md` | P1 contract trace evidence and batch-owned runtime acceptance obligations. |
| `docs/development/third-party.md` | Dependency rights review and redistribution notice obligations. |
| `docs/development/toolchain.md` | Verified stack versions, compatibility decisions and commands. |
| `docs/development/verification.md` | Check matrix, phase-closeout cadence and exact verification procedures. |
| `docs/operations/runbook.md` | Operator procedures and explicit readiness/recovery boundaries. |
| `docs/product/brief.md` | Problem, actors, first release, completion criteria and non-goals. |
| `docs/security/access.md` | P1 local administrator, session/CSRF, credential lifecycle, secret and audit contract. |
| `docs/security/boundaries.md` | Operator/agent trust, sensitive data and future protocol invariants. |
| `docs/ui/contract.md` | Local UI, accessibility, responsiveness and component ownership contract. |
| `docs/ui/localization.md` | Catalog-only copy policy and future locale-formatting gates. |
| `infra/systemd/tinywarden-agent.service` | Debian host-agent service with private state and terminal-error stop semantics. |
| `infra/systemd/tinywarden.service` | Uninstalled loopback-only native service template for an immutable release. |
| `scripts/check-localization.mjs` | TypeScript AST check for literal JSX text and accessible copy attributes. |
| `scripts/check-secrets.sh` | Phase-end redacted secret scan of the exact staged publication snapshot. |
| `scripts/check-source.mjs` | Source physical-line limits and prohibited tracked-file checks. |
| `scripts/codebase-map.mjs` | Deterministic inventory rendering and role completeness/staleness validation. |
| `scripts/inventory.mjs` | Shared Git-owned inventory and repository root resolution. |
| `scripts/map-roles.json` | Authored descriptions for all non-obvious tracked paths. |
| `scripts/verification.test.mjs` | Regression cases for map completeness, source limits and literal-copy guards. |
| `scripts/verify.sh` | Single local verification entry point with batch and phase-end modes. |
