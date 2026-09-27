# Contributing

Work from the [master plan](docs/development/master-plan.md). Select the current
phase and one dependency-ready batch. Keep each task traceable to acceptance and
evidence; do not start a later phase to bypass a blocked prerequisite.

Use a short-lived branch and a focused pull request once publication is enabled.
Group related changes by behavior and ownership, not arbitrary file counts.
Run focused local checks after each batch. At phase closeout, run the complete
gate, review dependency/license changes, and prepare a coherent publication.
The GitHub workflow is manual; do not add per-push or per-PR triggers.

All owned user-facing text belongs in the English catalogs, including metadata,
accessibility labels, validation messages and CLI help. See [localization](docs/ui/localization.md).
User content and protocol identifiers are not translation keys. Do not concatenate
translated sentence fragments. Add another language only with complete catalog,
formatting and layout checks.

When adding or removing files, stage the intended paths, author their non-obvious
roles in `scripts/map-roles.json`, and run `node scripts/codebase-map.mjs --write`.
Stage the resulting map. Conventional roles are generated; source roles survive
regeneration. Documentation, configuration and tests change with their contracts.

Never include secrets, local environment files or private process notes. Use the
human contributor identity. Retain third-party license notices; see
[third-party material](docs/development/third-party.md).
