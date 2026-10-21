# Contributing to TinyWarden

This repository owns the web application, health evaluation, access control and
shared skill presentation. Start with the [contributor guide](docs/contributing/README.md).
For UI changes, follow the [Playbook reference check](docs/contributing/playbook.md#required-ui-reference-check).

Use Node.js 24 and npm 11 from the repository root:

```sh
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm test
```

Use [development setup](docs/contributing/development.md) for local configuration
and the [verification guide](docs/contributing/verification.md) for test isolation
and check selection. Database cases require the reserved test target through
`TW_TEST_DATABASE_URL`; skipped cases do not establish database coverage.

Maintain file ownership in `scripts/map-roles.json`. Stage intended path additions
and removals, then regenerate the [file map](docs/agents/codebase-map.md):

```sh
node scripts/codebase-map.mjs --write
./scripts/verify.sh --batch
```

`./scripts/verify.sh --phase-end` is the complete release gate, including the build,
dependency audit and staged secret scan. Match verification to the changed area.
Preserve legal notices, public contracts and existing data/identity semantics.
Update the affected human guide/reference under the
[documentation policy](docs/contributing/documentation.md).
LLM assistants should read [AGENTS.md](AGENTS.md).
