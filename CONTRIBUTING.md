# Contributing

Use a focused branch and pull request. Describe the behavior changed, why it is
needed and how it was verified. Keep related code, tests and documentation together.
Read the [architecture](docs/architecture/overview.md) and the owning contract before
changing a protocol, storage rule, authorization boundary or skill interpretation.

## Checks

Run checks for the affected component during development. Run the complete
`./scripts/verify.sh --phase-end` gate when a coherent change is ready for release;
it installs locked dependencies and builds the app, so use a non-serving environment.
The manual GitHub workflow verifies a published revision; it does not run on every
push or pull request. See [verification](docs/development/verification.md) for test
configuration, scope and dependency policy.

## Display text and accessibility

All owned user-facing text belongs in the English catalogs, including metadata,
accessibility labels, validation messages and CLI help. See
[localization](docs/ui/localization.md). User content and protocol identifiers are
data. Do not concatenate translated sentence fragments. Keep keyboard access,
focus, labels and non-color status cues usable; see the [UI contract](docs/ui/contract.md).

## File map and compatibility

When adding or removing files, stage the intended paths, author non-obvious roles in
`scripts/map-roles.json`, run `node scripts/codebase-map.mjs --write` and include the
updated map. Conventional roles are generated. Agent examples have an exact source
revision and digests; follow [repository ownership](docs/architecture/repositories.md)
when updating them. Preserve historical schema and reading interpretation.

Never include secrets, local environment files, private fleet data or internal
process notes. Use your contributor Git identity. Retain upstream license notices;
see [third-party material](docs/development/third-party.md).
