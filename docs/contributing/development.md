# Development setup

Choose the [owning repository](README.md) before editing. A new compatible skill
starts with [Build skills](../build-skills/README.md), not a platform development
environment. Runtime observation requires the supported native sandbox even when
the author uses captured fixtures.

## Application

Use Node.js 24, the npm version in [package.json](../../package.json) and an existing
PostgreSQL 18 installation. From a non-serving checkout:

```sh
npm ci --include=dev --no-audit --no-fund
cp .env.example .env.local
```

Edit the ignored local file with a development database owned by role `tinywarden`
and an HTTPS origin you control. Keep the development database, listener and
credentials distinct from a deployed instance. Terminate HTTPS at a local proxy
if necessary; secure cookies and canonical-origin checks still apply.

After a database administrator has provisioned that owned development database:

```sh
node --env-file=.env.local --import tsx server/db/migrate.ts DEVELOPMENT_DATABASE_NAME
node --env-file=.env.local --import tsx scripts/operator.ts init
npm run dev
```

Replace `DEVELOPMENT_DATABASE_NAME` with the exact connection target. These first
two commands mutate it; they are not test setup commands. Next loads `.env.local`
for the development process. The listener defaults to loopback. Do not connect
real host agents or live SMTP/provider credentials merely to exercise synthetic UI.
See [configuration](../operating/configuration.md) for settings and
[test isolation](verification.md#database-tests) before running integration tests.

## Host agent and SDK

Use the exact Go toolchain required by
[go.mod](https://github.com/TinyWarden/tinywarden-agent/blob/main/go.mod), Python
3.13 and Linux/systemd support for real sandbox work. The module currently uses
only the Go standard library. In the host-agent checkout:

```sh
python3 -B scripts/source_check.py
python3 -B scripts/runtime_assets.py --check
./scripts/verify.sh --batch
```

Do not enroll a real host as a prerequisite for Go fixtures. Real collection and
SDK authoring execution require delegated CPU/memory/process limits, supported
isolation and controlled read-only host access. Use the supported
[author test setup](../build-skills/testing.md). An unavailable sandbox is a failed
prerequisite, not permission to execute package code outside it.

## Official skills

Use Python 3.13 and the bootstrap pinned by `SDK.lock.json`. Verification fetches
the exact reviewed SDK if it is not cached. In the official-skills checkout:

```sh
python3.13 -B scripts/verify.py
```

`--sandbox` adds real delegated execution. `TW_SKILL_SDK_SOURCE` is an explicit
source-development override, not a release/test default; unset it when proving the
published bootstrap. See [testing](../build-skills/testing.md) and
[publishing](../build-skills/publishing.md).

## Changes across boundaries

Inspect both request producer and consumer, schema/fixture identity and released
compatibility before changing transport or SDK behavior. Keep pure evaluation
deterministic and UI handling generic. Changes to trusted runtime bytes require
intentional manifest/pin updates and consumer verification; copying source beside
an app checkout does not update its installed runtime.

For schema changes add a forward migration, update typed ownership and verify
current/previous ledger behavior on the reserved test database. For UI changes use
the [Playbook check](playbook.md#required-ui-reference-check). Maintain file roles,
stage intended additions/removals and regenerate maps as described in
[verification](verification.md). Finish with the affected human/reference guidance.
