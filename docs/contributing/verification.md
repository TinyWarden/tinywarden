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

In the host-agent repo, `./scripts/verify.sh --batch` checks source guards, trusted
assets, authoring, Go formatting/vet/tests/build/module integrity and package
admission/archive tests. `--phase-end` adds native unit validation, pinned
`govulncheck` and secrets. The separate
`./scripts/verify.sh --batch --skills-author` profile adds author sandbox cases
under supported delegated limits; it does not replace the ordinary full gate.

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

In the host-agent repo use `python3 -B scripts/source_check.py --write`. Stage the
generated result too. Both maps live in `docs/agents/codebase-map.md`. Root
`AGENTS.md` is an intentional public instruction path; nested `AGENTS.md`, private
`.agents` paths, secrets and generated artifacts remain rejected by the guards.

## Release evidence

The manually dispatched `phase-closeout.yml` workflows verify a published revision;
there are no automatic push/PR/scheduled triggers. A local pass is not a GitHub
pass, and app fixtures do not prove an installed agent update. Match checks to the
actual distributed/deployed content and read back its version, runtime identity
and fresh health where applicable. See [release responsibilities](releases.md).

The dependency checker contains one narrowly scoped, expiring development-only
exception. Its source owns the permitted advisory/path/versions, exact lock hash
and expiry. All other audit findings and malformed/error reports fail. Never
describe an accepted exception as a clean raw audit, or renew it by changing prose.
