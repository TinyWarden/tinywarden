# Repository ownership

| Repository | Owns |
| --- | --- |
| [TinyWarden/tinywarden](https://github.com/TinyWarden/tinywarden) | Web app, PostgreSQL migrations, agent-facing APIs, operator UI, background jobs and app deployment. |
| [TinyWarden/tinywarden-agent](https://github.com/TinyWarden/tinywarden-agent) | Go agent, compiled recipes, local state/queues, tests, native service, packaging and operations. |

Neither product requires a sibling checkout to build or test. The app package is
at the repository root: `app/`, `components/`, `server/`, `i18n/`, `messages/`,
`public/`, `tests/` and package/config files. The agent module is
`github.com/TinyWarden/tinywarden-agent`, with `cmd/` and `internal/` at its root.

## Protocol and test examples

The app's [agent protocol](agent-protocol.md) and [baseline protocol](baseline-protocol.md)
are the server contracts. Agent documentation links to them. Changes must preserve
endpoint names, schema versions, digests, capabilities and installed agent state,
or explicitly define a compatible migration.

The agent owns its protocol/normalization examples. The app vendors the required
JSON examples under `tests/fixtures/agent`. Their manifest records an exact agent
revision and SHA-256 per file. `scripts/check-agent-fixtures.mjs` checks local
inventory and digests; optional `--source` compares them with the recorded Git
revision in an available agent checkout. Updating examples requires an intentional
manifest update and affected tests in both repositories. Ordinary tests use no
network download or sibling-directory lookup.

## Planned skill package ownership

The [skill platform](skill-platform.md#source-ownership-and-target-folders) owns the
target engine/package split. Official Python package source and the author SDK
belong in the agent repository, released independently from the Go agent binary. The
app consumes pinned artifacts and retains independent builds. Runtime, upload and
distribution support are planned; current compiled protocols remain supported.

## Native deployment

Optional app user-service templates live in `deploy/systemd/`; the agent's system
service belongs to its repository. `scripts/install-native-services.mjs` renders
app templates into private installed copies for the selected checkout. Local env
files own origin, port, database, mail and listener binding. Template edits do not
silently change installed units. Releases pin compatible job bundles before
restoring active timers; see [native deployment](../deploy/native.md).
