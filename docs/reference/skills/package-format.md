# Skill package format

Packages contain `skill.json`, `skill.py`, `settings.schema.json`,
`observation.schema.json`, `state.schema.json`, `messages/en.json`, `README.md` and
`LICENSE` at their root. Optional pure Python helpers, bounded JSON test fixtures,
`display.json` and `notifications.json` may accompany them. No install hooks, pip
downloads, native executables or uploaded UI code are supported.

## Manifest and schemas

The manifest declares format/SDK/runtime, namespaced ID, semantic version,
`state_version`, license, publisher, message keys, category, OS/architecture support,
default settings, schedule, capability requests, limits and field metadata.
SDK 2 additionally declares resource collections. Use the
[starter](../../build-skills/quickstart.md) or [resource example](../../build-skills/examples/targets/skill.json)
for an admitted shape. Verify support before advertising a platform.

IDs match `namespace/slug`: lowercase ASCII segments start with a letter and have
at most 64 letters/digits/hyphens. Official namespace/compatibility aliases are
reserved. Runtime is `python-3.13-v1`; SDK 1 uses format/sdk 1 and SDK 2 uses 2.
The published SDK's format/sdk 3 adds optional [action metadata](actions.md), with
separate permissions and execution negotiation. Older SDK 1/2 runtimes
cannot admit it. Resource collections are optional in format3.

Schemas use the SDK's closed bounded subset: type, properties, required,
`additionalProperties: false`, items, enum, numeric bounds and string/array length
bounds. Objects are closed, containers finite and schema depth at most eight.
References, regex, custom validators and remote retrieval are unsupported.
JSON must have unique keys, finite numbers and integers within ±(2^53−1).

SDK 1 settings are at most 64 scalar fields with required properties, matching
manifest defaults and labels/help/order. SDK 2 permits the declared host-scoped
bounded selection arrays. `interval_seconds`, if present, is an explicitly bounded
integer within 60–86400; omission uses 300 seconds. Cross-field validation returns
structured errors from `validate_settings`. It cannot expand schema permissions.

## Identity and admission

Identity is ID + version + content SHA-256. Identical reimports are idempotent;
different content for an existing ID/version is rejected. Content hashing includes
all files, including README/LICENSE/tests. It uses `tw-skill-content-v1` plus NUL,
then sorted paths with big-endian path/content lengths and raw file hashes.
ZIP timestamps/compression do not determine content identity. Pack returns both
content and archive hashes.

| Limit | Maximum |
| --- | --- |
| ZIP transport | 10 MiB |
| Total unpacked files | 20 MiB |
| One file | 8 MiB |
| Regular files | 256 |
| Path | 200 ASCII bytes, eight segments |

Paths allow letters/digits, underscore, hyphen, dot and slash. Absolute/dot/empty
segments, backslashes, collisions, links, devices, encrypted entries and malformed
archives are rejected. Allowed extensions are `.py`, `.json`, `.md`, `.txt`, plus
exact `LICENSE`. Actual streamed bytes are bounded independently of ZIP metadata.

Static admission never imports package code. Content is published read-only and
atomically; activation requires exact-digest administrator approval. Host delivery
checks archive and content identities again. A valid package is not proof of safe
or complete monitoring. See [host access](host-access.md) and [compatibility](compatibility.md).

The executable authority is the agent-owned
[package validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/packages/admission.py),
[schema subset](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/contracts/schema.py)
and [archive reader](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/packages/archives.py).
