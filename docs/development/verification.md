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
| Native unit syntax | Automated | `systemd-analyze verify infra/systemd/tinywarden.service` | Unit changes; phase end | Yes |
| npm dependency audit | Automated | `npm audit --prefix apps/web --audit-level=low` | Phase end only | Yes |
| Go vulnerability check | Automated | `govulncheck ./...` in `agent` | Phase end only | Yes |
| Staged secret scan | Automated | `./scripts/check-secrets.sh` | Phase end before publication | Yes |
| Rendered shell | Manual | Loopback desktop 1365×900 and narrow 390×844; inspect identity, overflow, console, skip link, 404 return link | UI changes; phase closeout review | No; browser-assisted evidence allowed |
| Catalog coverage | Manual | Review metadata, aria labels, errors, CLI and dynamic messages; static JSX guard cannot prove all dataflow | Copy/surface changes | No |
| Third-party rights | Manual | Review licenses, copied-source notices and dependency graph | New material/dependencies | No |
| Native service readiness | Manual | Resolve service user/paths/env, database ownership and resource conflicts before activation | Deployment decision | No |
| Migration/live integration | Not applicable | No schema, provider, agent protocol or DB client exists in scaffold; add gates with first slice | P1 onward | Future |
| Container checks | Not applicable | Native services selected | Until architecture changes | No |
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
database. A single deployment environment still requires isolated disposable test
resources when integration tests become applicable.

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
