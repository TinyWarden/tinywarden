# Verification

Run focused checks while editing. Broaden them when an affected boundary or a
release gate requires it. A passing compile does not establish authorization,
replay safety, sandbox behavior or visual fidelity. Record skipped prerequisites
as missing coverage, not a successful check.

## Application checks

Run these in a non-serving application checkout:

| Check | Establishes |
| --- | --- |
| `node scripts/check-source.mjs` | Source/configuration and protected-path conventions |
| `node scripts/codebase-map.mjs` | Exhaustive tracked-file roles and current generated map |
| `node scripts/check-localization.mjs` | Message catalogue coverage and visible-copy guard |
| `node scripts/check-agent-fixtures.mjs` | Exact vendored agent fixture inventory/digests |
| `node --test scripts/*.test.mjs` | Repository/release tool behavior |
| `npm run lint` and `npm run typecheck` | Static checks and generated Next types |
| `npm test` | Vitest behavior; database cases need their explicit connection |
| `npm run build` | Production compile |
| `node scripts/check-dependencies.mjs` | Complete audit under the exact checked-in exception policy |
| `./scripts/check-secrets.sh` | Secret scan of the staged publication snapshot |

`./scripts/verify.sh --batch` runs source/map/localization/fixture/tool/static/test
checks. `--phase-end` additionally performs a locked dependency install, production
build, systemd template validation, dependency audit and staged secret scan. It can
replace local dependencies and build outputs; do not run it in the serving tree.

For documentation changes, verify links/anchors, commands, current claims, roles
and staged secrets. A prose edit needs no app build, database reset or live restart.
Tooling changes need the affected tool tests. Real UI changes additionally require
the [rendered reference comparison](playbook.md#required-ui-reference-check).

### Native runtime integration

The SDK3 review-admission cases use the actual default verified Python runtime
and require its supported delegated sandbox. Opt in with `TW_TEST_NATIVE_RUNTIME=1`;
the ordinary app CI container does not provide this native environment. For a
supported systemd user session, run from a non-serving checkout:

```sh
systemd-run --user --wait --pipe --collect --property=Delegate=yes \
  --property=DelegateSubgroup=supervisor --setenv=TW_TEST_NATIVE_RUNTIME=1 \
  --working-directory="$PWD" node node_modules/vitest/vitest.mjs run \
  tests/skills/packages/action-review-admission.test.ts
```

This test needs no database. A skipped native suite is not runtime acceptance;
an opted-in run fails if its interpreter or sandbox is unavailable.

## Database tests

Provide `TW_TEST_DATABASE_URL` explicitly only to the test process. The harness
accepts the reserved database `tinywarden_test_p1b` on an existing PostgreSQL 18
instance, owned by login `tinywarden`. It checks current/session role, database
and schema ownership before resetting synthetic fixtures. It never falls back to
`DATABASE_URL` or starts a separate cluster. The test target is disposable: its
owned schema can be removed during tests.

Do not load production environment files, SMTP routes, provider secrets or serving
feature flags into tests. Without a test connection, database-backed cases skip;
that is not database acceptance. Package-engine integration tests also require the
supported delegated Python sandbox. Keep those prerequisites explicit in results.
For example, after privately configuring the reserved connection in the shell:

```sh
npm test -- tests/skills/resources/engine.test.ts
```

Choose affected cases for permission denial, concurrent revocation, changed/exact
retries, late evidence, retention and rollback. Avoid tests that merely restate a
presentation class or mirror a low-impact prose edit.

## Host-agent and skill checks

In the host-agent repo, `./scripts/verify.sh --batch` runs tooling tests, runtime
integrity, all SDK unit tests, process-boundary checks and Go format/vet/tests/
build/module verification. SDK unit tests live in `sdk/python/tests/`; native
process and sandbox tests live in `tests/integration/`. `--phase-end` adds native
unit validation, pinned `govulncheck` and staged secrets.

The `./scripts/verify.sh --batch --skills-author` profile runs the SDK/tooling
checks and real author sandbox cases without the Go gate. Use
`./scripts/verify.sh --batch --sandbox` for the ordinary gate plus native authoring
and runtime isolation cases. Both scopes require supported delegated limits and
fail when isolation is unavailable; neither silently counts missing prerequisites
as a pass. The author-only profile does not replace the complete release gate.

In official skills, `python3.13 -B scripts/verify.py` checks behavior, admission
and reproducible ZIP/catalogue output using the pinned SDK. Optional `--sandbox`
adds real execution. For an individual package use
[validate/test/collect/pack](../build-skills/testing.md). A captured-observation pass
does not establish real host access or current installed-agent compatibility.

## Maps and public instructions

Maps enumerate staged/tracked paths, not arbitrary untracked files. Maintain
`scripts/map-roles.json`, stage intended additions/removals, then regenerate:

```sh
node scripts/codebase-map.mjs --write
```

In the host-agent repo use `python3 -B scripts/checks/source_check.py --write`. Stage the
generated result too. Both maps live in `docs/agents/codebase-map.md`. Root
`AGENTS.md` is an intentional public instruction path; nested `AGENTS.md`, private
`.agents` paths, secrets and generated artifacts remain rejected by the guards.

The agent source checker reports files above 300 lines for cohesion review; this
diagnostic does not fail verification. Role inventory, protected paths, regular
files and runtime integrity remain mandatory. The application source checker has
its own unchanged rules; the agent's size diagnostic does not alter them.

## Release evidence

The manually dispatched `phase-closeout.yml` workflows verify a published revision;
there are no automatic push/PR/scheduled triggers. A local pass is not a GitHub
pass, and app fixtures do not prove an installed agent update. Match checks to the
actual distributed/deployed content and read back its version, runtime identity
and fresh health where applicable. See [release responsibilities](releases.md).

## Dependency audit policy

Keep `package-lock.json` committed and use `npm ci` for reproducible installs.
`node scripts/check-dependencies.mjs` runs a fresh, complete `npm audit --json`
without omitting development packages. A successful exception check is not a clean
raw audit: the command retains the finding count, advisory and expiration in its
output. It also prints the SHA-256 of the entire checked lockfile for release
evidence. That hash records the exact input; it does not authorize an exception.

The versioned [exception policy](../../scripts/dependency-exceptions.json) is the
only exception configuration. Version 1 records, for each temporary exception:

- The exact GitHub advisory URL, approval start, expiry and reason.
- Every approved installed package path, name, version, registry URL, SHA-512
  integrity and dependency declarations.
- Every incoming dependency edge: consumer path, dependency kind, name, range and
  resolved target path, including the root development dependency.
- The exact raw audit rows, severity, installed paths and advisory/propagation
  identities. Additional findings remain blocking at every severity.

The checker validates the policy, npm report and lockfile structure. For an active
exception it resolves the npm v3 package graph, checks all occurrences (including
nested and aliased copies), and walks production dependencies, optional dependencies
and installed peers independently of lockfile development flags. Every approved
package must remain development-only; a new consumer, production reachability,
changed package identity/integrity/graph or extra audit path fails. Unsupported
lock formats and workspace links also fail while an exception is in use.

Unrelated dependency and formatting changes can pass without renewing approval.
A clean audit can pass after the exception expires or its packages disappear;
otherwise the expiry is exclusive and cannot be extended by prose or a new lock
hash. Changing the accepted advisory, affected packages/paths/graph, exposure or
approval interval requires explicit review and approval of the policy change.
Overlapping audit rows in multiple exceptions are rejected rather than merged.

The current policy permits only `GHSA-vfj7-8cjw-p6xm` in the four-package Next
ESLint development chain: `@next/eslint-plugin-next` 16.3.6 → `fast-glob` 3.3.1 →
`micromatch` 4.0.8 → `braces` 3.0.3. Its expiry remains
**November 1, 2026 at 22:00 UTC**. Replace the chain with a compatible fixed
upstream version before that deadline; the policy does not cover another braces
installation or advisory. Run `node --test scripts/check-dependencies.test.mjs`
when changing this mechanism.

## Architectural boundary and API coverage

The host-agent batch gate and automatic push/pull-request workflow run
`python3 -B scripts/checks/neutrality.py`. It checks the complete production
nonstandard dependency graph for Linux amd64 and arm64, Go embedded data and every
signed-runtime asset. New packages or runtime files require an explicit ownership
review of `scripts/checks/platform-boundary.json`; do not expand that policy merely
to pass a failing test. Regression cases demonstrate rejection of new dependencies,
added payloads and domain behavior hidden in an existing file. Source scanning
supports architectural review; extension acceptance also runs an independent skill
against the same runtime without platform changes.

`python3 -B scripts/checks/public_api.py` in the agent checks `docs/public-api.json`
against implemented HTTP paths, broker operations, monitor/action/context calls and
author commands. A deliberate API change updates this inventory, its human reference
and affected consumers together. In the app, `node scripts/check-public-api.mjs`
compares the pinned inventory with the vendored runtime identity, route existence
and public documentation. It runs in normal verification without a sibling checkout.
