# Toolchain and commands

`package-lock.json`
owns the exact dependency graph; the separate tinywarden-agent repository owns the agent Go toolchain.
The app requires no Go module; Go in app CI only builds the pinned secret scanner.

| Tool | Version / requirement | Source |
| --- | --- | --- |
| Node / npm | Node 24 LTS; npm 11.16.0 | [Node releases](https://nodejs.org/en/about/previous-releases) |
| Next / React | Next 16.3.6; React/React DOM 19.3.0 | [Next installation](https://nextjs.org/docs/app/getting-started/installation) and npm metadata |
| TypeScript | 5.9.3; strict, unchecked indexing, exact optional properties | npm metadata; Next minimum 5.1 |
| Styling / primitives | Tailwind 4.3.3; shadcn CLI 4.21.0, official Radix card/badge sources | [shadcn](https://ui.shadcn.com/docs/installation/manual) |
| Lint | ESLint 10.11.0; typescript-eslint 8.70.1; Next plugin 16.3.6; React hooks 7.1.1 | npm peer metadata; [ESLint support](https://eslint.org/version-support/) |
| Tests | Vitest 5.0.2; Node built-in tests for verification; app behavior tests | npm metadata; Go docs |
| Agent | Go 1.27.1, standard library only | [Go release history](https://go.dev/doc/devel/release) |
| Database target | Native PostgreSQL 18.6 | [PostgreSQL support](https://www.postgresql.org/support/versioning/) |
| SQL/query migration runtime | Kysely 0.29.6; pg 8.23.0; tsx 4.23.15 for explicit TypeScript CLI commands | Installed package metadata; direct packages declare MIT |
| Closeout scanners | Gitleaks 8.30.1; govulncheck v1.8.0 | Official release/Go module metadata |
| GitHub actions | checkout 7.0.1; setup-node/setup-go 7.0.0; exact commit pins, Node 24 action runtime | Official action release/tag metadata and input manifests |

Use ESLint 10 with
direct Next, TypeScript and hooks plugins. The bundled `eslint-config-next` brings
React/import/a11y plugins whose current peer ranges exclude ESLint 10, so it is not
installed. Semantic/keyboard/a11y review remains mandatory; no peer checks are bypassed.

Use ESM for tooling. Next's bundler resolves `@/*`; semantic checking runs separately
with `next typegen && tsc --noEmit`. Keep `next-env.d.ts` and `.next` untracked.
Do not suppress type errors or mix browser and privileged server modules.

```sh
npm ci --no-audit --no-fund
npm run dev -- --port 3000
npm run lint
npm run typecheck
npm test
npm run build
npm run start -- --port 3000
```

Kysely's Migrator/FileMigrationProvider applies the versioned schema through an
explicit command. [Data and migrations](../architecture/data.md#tooling)
defines compatibility and target guards; the lockfile owns exact versions.

Use Node's asynchronous scrypt for the single local administrator as specified in
the [access contract](../security/access.md). No auth crypto package, ORM, queue or
provider SDK is selected. Tests use synthetic data and disposable resources, never
the live database. PostgreSQL tests use the reserved `tinywarden_test_p1b` database
on the existing instance. Tooling telemetry is disabled.
