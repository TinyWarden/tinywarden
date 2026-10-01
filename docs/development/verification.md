# Verification contract

One entry point: `./scripts/verify.sh --batch` during work and
`./scripts/verify.sh --phase-end` at phase closeout. The latter includes the batch
checks. Both fail on a required check failure. Run focused commands when only one
boundary changes; do not rerun the whole gate after every edit.

Security scans and GitHub checks run **only at phase closeout**. Publication is
scheduled at phase closeout so the required staged-secret scan precedes it.
`.github/workflows/phase-closeout.yml` has only `workflow_dispatch`, with a required
phase identifier. No push/PR/scheduled triggers are configured. Dispatch only after
the exact intended commit is published under separate authority. A local pass
does not imply a GitHub pass. Scanner installation is not a scan.

GitHub's host runs the job in the digest-pinned official Debian 13 image so agent
metadata and the real command supervisor meet the supported distribution policy.
Container setup installs the native tools and pinned scanners as root; the complete
verification entry point runs as the unprivileged `tinywarden-ci` account with its
own home and writable workspace. Production platform/identity admission and all
test assertions remain intact. This is disposable GitHub CI infrastructure; product
deployment continues to use native services. See [GitHub's job-container contract](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/run-jobs-in-a-container).

Deployment reuses matching accepted phase evidence and runs the
[scoped native readbacks](../deploy/native.md#select-only-the-changed-release-steps).
Do not rerun full suites, security/GitHub checks, exhaustive data comparisons or
browser/recipe-edit proofs solely because accepted code is being deployed.
New implementation runs affected tests; phase closeout retains its full gate.

P4 phase preparation runs the complete gate in an isolated source/dependency
workspace, never `.next` or `npm ci` in the serving checkout. Copy the accepted
Git tree, use npm11.16.0 and the guarded `TW_TEST_DATABASE_URL` for the existing
owned `tinywarden_test_p1b` database. Give the isolated index that exact tree so
inventory/map and staged-secret checks cover it. No extra PostgreSQL cluster/role,
provider delivery, live service or agent change is part of this local gate.
The phase install uses NODE_ENV=production with --include=dev, matching the
release's required build dependencies rather than relying on npm's default.

| P4 release boundary | Status | Command / procedure | Trigger and CI |
| --- | --- | --- | --- |
| Native orchestration and safety | Automated | `node --test scripts/native-release.test.mjs`; included in the top-level gate. Wrong scope/source/role/permissions, checkout lock, scoped commands, drained jobs, private backups, failure-stop/no-restore and authenticated smoke. The PG case uses the reserved existing test database. | P4.C; CI runs portable cases and honestly skips PG without its guarded URL. |
| Job unit syntax | Automated | `systemd-analyze verify infra/systemd/*.service infra/systemd/*.timer`; included at phase end. | Job assets; CI and local phase gate, no installation/enablement. |
| Lifecycle, notification and populated recovery | Automated | Complete web suite with reserved database, including P4.A restore/receipt/recovery and P4.B state/outbox/SMTP fixtures. | P4 phase end locally. CI without database does not claim these proofs. |
| Accepted source and package | Manual | Capture exact tree via `native-release.mjs snapshot`, verify fingerprints, execute read-only upgrade `plan`, package the gate-built agent and reconcile binary/unit hashes plus archive inventory. | P4.C before final review; not a live deployment. |
| Release readiness | Manual | Main-chat Astra review of exact artifacts, migration/restore evidence, rollback boundary and opt-in jobs. Carry forward unchanged P3 UI/agent proof; no new UI or agent runtime changes in P4. | Required P4.C model gate, before phase acceptance/deployment. |
An explicit release-specific required check remains required until satisfied or
the owner changes its scope. Historical release records do not impose their entire
checklist on subsequent releases.

## Check matrix

| Check | Status | Exact command or procedure | Trigger | CI |
| --- | --- | --- | --- | --- |
| File sizes | Automated | `node scripts/check-source.mjs` | Handwritten code changes | Yes |
| Tracked-file prohibitions | Automated | `node scripts/check-source.mjs` | Inventory/config changes | Yes |
| Exhaustive map | Automated | `node scripts/codebase-map.mjs` | Add/remove/move/role changes | Yes |
| Catalog-only JSX | Automated | `node scripts/check-localization.mjs` | UI/copy changes | Yes |
| Verification regressions | Automated | `node --test scripts/verification.test.mjs` | Gate changes; phase end | Yes |
| Lint and TS | Automated | `npm --prefix apps/web run lint` and `npm --prefix apps/web run typecheck` | Web changes | Yes |
| Web tests | Automated | `npm --prefix apps/web test` | Affected behavior; phase end | Yes |
| Go format/static/test/build | Automated | `gofmt -l cmd internal` (must be empty), `go vet ./...`, `go test ./...`, `go build -o ../bin/tinywarden-agent ./cmd/tinywarden-agent` in `agent` | Agent changes | Yes |
| Reproducible npm install | Automated | `npm ci --prefix apps/web --no-audit --no-fund` | Phase end | Yes |
| Go module integrity | Automated | `go mod verify` in `agent` | Go dependency changes | Yes |
| Production web build | Automated | `npm --prefix apps/web run build` | Phase end | Yes |
| Native unit syntax | Automated | `systemd-analyze verify infra/systemd/tinywarden.service infra/systemd/tinywarden-agent.service` | Unit changes; phase end | Yes |
| npm dependency audit | Automated | `npm audit --prefix apps/web --audit-level=low` | Phase end only | Yes |
| Go vulnerability check | Automated | `govulncheck ./...` in `agent` | Phase end only | Yes |
| Staged secret scan | Automated | `./scripts/check-secrets.sh` | Phase end before publication | Yes |
| Rendered shell | Manual | Loopback desktop 1365×900 and narrow 390×844; inspect identity, overflow, console, skip link, 404 return link | UI changes; phase closeout review | No; browser-assisted evidence allowed |
| Catalog coverage | Manual | Review metadata, aria labels, errors, CLI and dynamic messages; static JSX guard cannot prove all dataflow | Copy/surface changes | No |
| Third-party rights | Manual | Review licenses, copied-source notices and dependency graph | New material/dependencies | No |
| Native service readiness | Manual | Resolve service user/paths/env, database ownership and resource conflicts before activation | Deployment decision | No |
| P1 design contract | Manual | Trace the seven paths in [P1 acceptance](p1-acceptance.md#p1a-contract-review-evidence), check official tool metadata and local links/map | P1.A and contract changes | No |
| P1.B database/access integration | Automated local | `test -n "${TW_TEST_DATABASE_URL:-}" && npm --prefix apps/web test -- tests/p1b.boundaries.test.ts tests/p1b.integration.test.ts tests/p1b.migrations.test.ts tests/p1b.cli.test.ts`; the variable must identify the owned `tinywarden_test_p1b` database on the existing instance | P1.B and phase end; this test resets only that database after identity checks | No; requires reserved local test database |
| P1.C heartbeat and fleet integration | Automated local | `test -n "${TW_TEST_DATABASE_URL:-}" && npm --prefix apps/web test -- tests/p1c.server.test.ts`; use only the owned `tinywarden_test_p1b` database on the existing instance. Run `go test ./...` and `go vet ./...` in `agent`. Browser review and disposable Debian 13 acceptance are recorded separately. | P1.C; synthetic DB reset is guarded by identity/ownership checks | No; requires reserved local test database |
| P1.D credential lifecycle | Automated local | `test -n "${TW_TEST_DATABASE_URL:-}" && npm --prefix apps/web test -- tests/p1b.migrations.test.ts tests/p1d.audit.test.ts tests/p1d.lifecycle.test.ts tests/p1d.session-timing.test.ts`; run `go test ./...` and `go vet ./...` in `agent`. The database tests use only the owned `tinywarden_test_p1b` target after ownership checks. The session timing file cleans up only its random fixtures. Agent protocol failures use local HTTPS fixtures. Backup/restore rehearsal and live deployment remain separate procedures. | P1.D and phase end | No; requires reserved local test database |
| P2.A checks and policy | Automated local plus manual render | `TW_TEST_DATABASE_URL` must identify the owned `tinywarden_test_p1b` database; run `npm --prefix apps/web test -- tests/p1b.migrations.test.ts tests/p2a.checks.test.ts`, web lint/typecheck, `go test ./...` and `go vet ./...` in `agent`. Render the global form and host override/reset/conflict flow at 1365×900 and 390×844 in an isolated preview using synthetic data. | P2.A; database fixture reset is guarded by ownership checks | No; requires reserved local test database and isolated browser preview |
| P2.B disk observations | Automated local plus manual render | `TW_TEST_DATABASE_URL` must identify the owned `tinywarden_test_p1b` database; run `npm --prefix apps/web test -- tests/p2b.runs.test.ts`, web lint/typecheck, `go test ./...`, `go test -race ./...` and `go vet ./...` in `agent`. Render host disk health and history at 1365×900 and 390×844 in an isolated preview using synthetic data. Prove the fixed collector sees a temporary local mount outside `/` on an approved disposable Debian host, then remove that mount. | P2.B; database fixture reset is guarded by ownership checks | No; requires reserved local test database, isolated browser preview and disposable VM |
| P2.C recovery and release | Automated local plus approved live proof | `TW_TEST_DATABASE_URL` must identify `tinywarden_test_p1b`; run `npm --prefix apps/web test -- tests/p2c.recovery.test.ts tests/p2c.latch-boundaries.test.ts`, the complete guarded web suite, Go tests/race/vet/module verification/build, source/map/localization/unit checks, npm audit, govulncheck and a temporary-index secret scan. Rehearse `pg_dump -Fc`/single-transaction `pg_restore` on a disposable database in the existing instance and verify migration 005 recovery markers. The [live upgrade plan](../deploy/p2-live-upgrade.md) owns the separately authorized production build, live backup/migrations/restart, VM agent upgrade and C01 policy delivery. | P2.C; safe local gates now, live and GitHub gates after specific authority | Local only until approved live and publication windows |
| Container checks | Not applicable | Native services selected | Until architecture changes | No |
| P3.1 execution design | Manual plus inventory checks | Trace [P3 acceptance](p3-acceptance.md#p31-design-review); verify official tool behavior, local links and map | P3.1/contract changes | No |
| P3.A runner | Automated | In `agent`, run `go test ./internal/runner ./internal/cli`, `go test -race ./internal/runner` and `go vet ./internal/runner ./internal/cli`; prove A01–A05 with synthetic child fixtures, including a disposable real CLI build. No live commands beyond approved read-only probes. See [executed evidence](p3-acceptance.md#p3a-implementation-evidence). | P3.A implementation; full Go gate at phase closeout | Future ordinary Go phase gate |
| Heavyweight security scan | Not applicable | No such scan is authorized; existing bounded secret/dependency gates still apply | Separate scope decision | No |

## Inventory and evidence

Stage intended file additions/removals so Git owns the inventory. Authored roles
live in `scripts/map-roles.json`; deterministic roles for lockfiles and conventional
config live in the map generator. Regenerate with `node scripts/codebase-map.mjs --write`
and stage the map. Checks fail for stale roles, undocumented paths or missing files.
300 lines is ordinary; 301–500 produces a review requirement; over 500 fails.
Documentation, catalogs and generated lockfiles are excluded from source-size limits.

Record phase results against an exact commit or identified staged snapshot. Before
the initial authorized commit, evidence is provisional and must be committed with
its source before publication. Link durable results from the master plan. Keep
private diagnostics in private records; never put credentials into test output.

Do not run schema-resetting tests or rehearsal imports against the production
database. P1.B uses `tinywarden_test_p1b` on the existing PostgreSQL instance as the
single `tinywarden` login. Verify the connected target and ownership before fixture
reset; the [data contract](../architecture/data.md#postgresql-ownership-and-test-targets)
owns the exact safeguards. Do not start a separate PostgreSQL cluster for tests.
Shared ownership means this test separation is operational, not a privilege boundary.

## P0 scaffold evidence

Verified 2026-09-28 on Linux x86_64, Node 24.18.0/npm 11.16.0, Go 1.27.1.
`./scripts/verify.sh --batch` and `./scripts/verify.sh --phase-end` both exited 0.
The reviewed snapshot contains the entire scaffold; its exact Git tree and resulting
application commit are recorded in the private bootstrap evidence. The owner accepted
the result and authorized initial local commits on 2026-09-28. Publication is separate.
Acceptance changes affect documentation and private lifecycle records only; focused
inventory, whitespace, link and lifecycle checks accompany the existing full-gate
evidence. Runtime source and dependency locks are unchanged from the verified snapshot.

| Result | Evidence |
| --- | --- |
| Inventory/source/copy gates passed | 57 tracked paths; largest source 91 physical lines; no undocumented/stale role or prohibited tracked file. |
| Static checks passed | ESLint, Next-generated route types and strict TypeScript; Go formatting and vet. |
| Tests passed | 3 verification regression tests; 2 web catalog tests; all Go CLI tests. |
| Reproducible install/build passed | Clean npm lockfile install; optimized Next production build; Go executable build and module integrity. |
| Unit syntax passed | `systemd-analyze verify` accepted the uninstalled template. |
| Phase-end security passed | npm audit: 0 vulnerabilities; govulncheck: none found; Gitleaks: no staged secrets. |
| Browser/keyboard review passed | Production entry on temporary loopback port 3179; Chromium 153 via Playwright 1.63.0; desktop 1365×900 and narrow 390×844. |
| UI flow passed | Home → keyboard skip link → translated missing page → Return home. Correct title/language, no overflow, blank screen, error overlay, external requests or page errors. Intentional missing-page request produced the expected HTTP 404 console message. |
| Rights/catalog/docs review passed | Direct dependency licenses and copied MIT notice reviewed; all owned screen/CLI copy catalog-backed; local documentation links resolve. |
| GitHub execution not run | Workflow inspected; dispatch waits for separately authorized publication at a phase boundary. No remote success is claimed. |
| Live service/database checks deferred | No service activation, schema or database client in scaffold. Their readiness gates precede product deployment. |

The Browser plugin was unavailable; a temporary Playwright harness outside the
repositories provided smoke evidence. The preview process was stopped by its
captured identity and the loopback port was released. No persistent service was
installed. Browser coverage is Chromium only; it does not establish future product
flows, screen-reader behavior or cross-browser support.

## P3 integration and serving-checkout isolation

P3.C focused web proof uses `tests/p3c.{protocol,delivery,runs,recovery,editor}.test.ts`
and the existing P3.B shared fixtures on the guarded `tinywarden_test_p1b` target.
Go `go test -race ./internal/agent -run Baseline -count=1` covers lease, queue,
scheduler, replay and interruption ownership. The explicit disposable VM test is
skipped unless its private synthetic config is supplied; a default skip is not
connected-host evidence. See [C01–C04 evidence](p3-acceptance.md#p3c-implementation-evidence).

The service runs from the owner's main checkout. Do not overwrite its dependencies,
`.next` or agent binary during local verification. Copy every Git-owned source path
with per-file fingerprints to a disposable verification directory, use independent
dependencies, and run the unchanged `verify.sh --phase-end` there with explicit
Git worktree/index variables. A temporary index contains exactly the copied owned
source, so the staged-secret scan examines that source without modifying the main
index or creating a commit. Builds remain disposable outputs. A loopback preview
using only reserved synthetic DB state, and an explicit test CA for the disposable
VM test binary, prove UI/transport without a second product deployment or altered
production trust. Remove temporary remote files/forwarding after proof. GitHub
checks and live activation retain separate authority.

## P4.A focused lifecycle verification

Use `npm --prefix apps/web test -- tests/p4a.retention.test.ts
 tests/p4a.recovery.test.ts` with `TW_TEST_DATABASE_URL` identifying only the existing
owned `tinywarden_test_p1b` database. The suite checks the
[data lifecycle acceptance table](../architecture/data-lifecycle.md#recovery-contract-and-focused-acceptance),
including a single synthetic custom dump/restore to its own disposable database on
that same instance. Run the changed-file static checks and affected ingestion/health,
audit, migration and session-timing suites. No build in the serving checkout or
live cleanup is part of this local batch. Full/security/GitHub gates stay at P4 end.


## P4.B focused notification verification

Use `npm --prefix apps/web test -- tests/p4b.config.test.ts
 tests/p4b.health.test.ts tests/p4b.states.test.ts tests/p4b.limits.test.ts
 tests/p4b.smtp.test.ts` with the existing owned `tinywarden_test_p1b` target.
These tests reset only its guarded synthetic schema. Capture and a loopback SMTP
fixture use synthetic identities/settings; never load private provider settings.
The [contract](../architecture/notifications.md#sol-implementation-and-focused-acceptance)
defines required transition, concurrency, uncertainty and authority proof. Verify
outside the serving installation so new dependencies do not replace live modules.
The new central audit/connection adapter and shared projections affect existing web
consumers; one complete web suite is the bounded consumer regression pass. Go and
full repository/security/GitHub gates remain P4.C. This is not live delivery proof.
