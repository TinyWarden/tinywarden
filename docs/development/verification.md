# Verification

Run focused checks for an affected boundary during development. The convenience
entrypoints are `./scripts/verify.sh --batch` and
`./scripts/verify.sh --phase-end`; the latter includes the former, a locked install,
production build and release checks. Use a non-serving environment for installation
or full verification. Failed required checks block acceptance.

## Check matrix

| Check | Scope |
| --- | --- |
| `node scripts/check-source.mjs` | Source/configuration conventions. |
| `node scripts/codebase-map.mjs` | Complete tracked-file map and authored roles. |
| `node scripts/check-localization.mjs` | Catalog coverage and literal display-copy guard. |
| `node scripts/check-agent-fixtures.mjs` | Vendored example inventory and exact digests. |
| `node --test scripts/*.test.mjs` | Repository/release tooling behavior. |
| `npm run lint`, `npm run typecheck` | Static code checks and generated Next types. |
| `npm test` | App behavior, authorization, transactions and skill projections. |
| `npm run build` | Production compile. |
| `systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer` | Optional native template syntax. |
| `node scripts/check-dependencies.mjs` | Complete npm audit under the narrow dependency policy below. |
| `./scripts/check-secrets.sh` | Secret scan of the staged publication snapshot. |

Documentation-only changes need links, current technical statements, file-map
coverage and the publication secret scan. They need no app build, database reset,
agent execution or live restart. Releases reuse matching evidence for unchanged
components and follow [scoped readbacks](../deploy/native.md#select-only-the-changed-release-steps).

## PostgreSQL tests

Supply `TW_TEST_DATABASE_URL` explicitly for integration tests. The harness accepts
only the reserved `tinywarden_test_p1b` database on the existing PostgreSQL 18
instance, owned by the `tinywarden` login. It checks current/session role, database
and schema ownership before resetting synthetic fixtures. It never falls back to
`DATABASE_URL` or starts another cluster. Missing configuration means the database
checks were not run. Tests can remove their owned synthetic schema; never supply a
serving database. See [database ownership](../architecture/data.md#postgresql-ownership-and-test-targets).
SMTP fixtures use synthetic local routes, not real provider settings.

Package-engine PostgreSQL tests require the Python SDK's delegated native service
limits. Use only the reserved test database and synthetic capture configuration.
Runtime release acceptance includes fresh built-in readings interpreted by the
installed web service, its configured service namespace and a normally advancing
agent heartbeat. A collector-only pass does not verify the server interpreter.

## GitHub and agent verification

`.github/workflows/phase-closeout.yml` runs only by manual dispatch against a
published revision. It has no push, PR or scheduled triggers. A local pass does
not imply a GitHub pass. Security/dependency and provider gates run at release
closeout, not after each tiny edit. The app workflow uses a digest-pinned Debian 13
job container, initializes native tools/scanners as root and verifies as an
unprivileged account. This is disposable CI infrastructure, not product deployment.

Agent execution, Go checks and supported-host proof belong to the independent
[agent repository](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/verification.md).
App fixture tests do not establish that an installed agent was upgraded.

## Temporary dependency exception

The checker permits only [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
through the development-only chain
`@next/eslint-plugin-next@16.3.6 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`.
It is bound to lockfile SHA-256
`240e1dcd670b3882431f212bfe925eb25f24ea65e88983a825b6e30564ba3f11`
and expires on a lockfile change or at `2026-11-01T22:00:00Z`, whichever is earlier.
The complete audit still runs; other findings, paths, versions, runtime placement,
expired exceptions and malformed/error reports fail. The exception is reported
explicitly and does not mean the raw audit is clean. Reassess when exposure changes
or a relevant patch becomes available; retain focused checker tests.
