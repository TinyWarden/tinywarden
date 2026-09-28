# Toolchain and commands

Verified 2026-09-28 from official sources/registries. `apps/web/package-lock.json`
owns the exact dependency graph; `agent/go.mod` owns the Go language/toolchain floor.

| Tool | Accepted version/direction | Source |
| --- | --- | --- |
| Node / npm | Node 24 LTS; npm 11.16.0 | [Node releases](https://nodejs.org/en/about/previous-releases) |
| Next / React | Next 16.3.6; React/React DOM 19.3.0 | [Next installation](https://nextjs.org/docs/app/getting-started/installation) and npm metadata |
| TypeScript | 5.9.3; strict, unchecked indexing, exact optional properties | npm metadata; Next minimum 5.1 |
| Styling / primitives | Tailwind 4.3.3; shadcn CLI 4.21.0, official Radix card/badge sources | [shadcn](https://ui.shadcn.com/docs/installation/manual) |
| Lint | ESLint 10.11.0; typescript-eslint 8.70.1; Next plugin 16.3.6; React hooks 7.1.1 | npm peer metadata; [ESLint support](https://eslint.org/version-support/) |
| Tests | Vitest 5.0.2; Node built-in tests for verification; Go standard tests | npm metadata; Go docs |
| Agent | Go 1.27.1, standard library only | [Go release history](https://go.dev/doc/devel/release) |
| Database target | Native PostgreSQL 18.6 | [PostgreSQL support](https://www.postgresql.org/support/versioning/) |
| SQL/query migration runtime | Kysely 0.29.6; pg 8.23.0; tsx 4.23.15 for explicit TypeScript CLI commands | Installed package metadata; direct packages declare MIT |
| Closeout scanners | Gitleaks 8.30.1; govulncheck v1.8.0 | Official release/Go module metadata |
| GitHub actions | checkout 7.0.1; setup-node/setup-go 7.0.0; exact commit pins, Node 24 action runtime | Official action release/tag metadata and input manifests |

ESLint 9 from the initial proposal is end-of-life. Use supported ESLint 10 with
direct Next, TypeScript and hooks plugins. The bundled `eslint-config-next` brings
React/import/a11y plugins whose current peer ranges exclude ESLint 10, so it is not
installed. Semantic/keyboard/a11y review remains mandatory; no peer checks are bypassed.
Go 1.24 from historical material is unsupported; PostgreSQL 18 replaces historical
17 before any schema or production data exists.

Use ESM for tooling. Next's bundler resolves `@/*`; semantic checking runs separately
with `next typegen && tsc --noEmit`. Keep `next-env.d.ts` and `.next` untracked.
Do not suppress type errors or mix browser and privileged server modules.

```sh
npm ci --prefix apps/web --no-audit --no-fund
npm --prefix apps/web run dev -- --port 3000
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web test
npm --prefix apps/web run build
npm --prefix apps/web run start -- --port 3000
cd agent
go test ./...
go build -o ../bin/tinywarden-agent ./cmd/tinywarden-agent
```

P1.B installed Kysely 0.29.6, pg 8.23.0, tsx 4.23.15 and @types/pg 8.23.1.
Kysely's built-in Migrator/FileMigrationProvider applies the versioned schema through
an explicit command. The [data contract](../architecture/data.md#p13-tooling-decision)
owns rationale, compatibility and migration semantics. Local package metadata
confirms exact versions and MIT licenses. The lockfile records the graph; reproducible
installation and dependency audit remain phase-closeout checks.

Use Node's asynchronous scrypt for the single local administrator as specified in
the [access contract](../security/access.md). No auth crypto package, ORM, queue or
provider SDK is selected. Tests use synthetic data and disposable resources, never
the live database. PostgreSQL tests use the reserved `tinywarden_test_p1b` database
on the existing instance. Tooling telemetry is disabled.
