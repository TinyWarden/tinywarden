# Skill package v1

Status: SDK v1 ZIP upload, disabled-first installation, permission review, shared
controls, observations/state, explicit version selection and authenticated exact
package delivery are implemented. A marketplace and public vetting service are deferred.
See [platform ownership](skill-platform.md) and [execution boundary](skill-runtime.md).
The agent repository owns the [authoring guide and local tools](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/authoring.md)
and [Python SDK v1 reference](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/sdk-v1.md).

## Contents and identity

A prepared package directory or ZIP contains these files at its root:

```text
skill.json
skill.py
settings.schema.json
observation.schema.json
state.schema.json
messages/en.json
README.md
LICENSE
```

Optional pure Python modules and test fixtures may accompany them. A manifest has
`format: 1`, namespaced `id`, SemVer `version`, `runtime: "python-3.13-v1"`,
`sdk: 1`, `state_version`, SPDX license expression, publisher/name/description keys,
category, supported OS/architecture identifiers, default settings/schedule,
requested capabilities and resource limits. Unknown required capabilities, formats,
schema keywords or runtime versions reject the package before activation. Publisher
metadata is a claim, not verified authorship or marketplace approval.

IDs are lowercase ASCII `namespace/slug`; each segment is 1–64 letters, digits or
hyphens, starting with a letter. `tinywarden` is reserved for official artifacts.
The four existing keys remain stable aliases to their official installations.
Community packages cannot claim those aliases or replace official packages.
Initially advertise verified Debian 13 compatibility only. A manifest cannot make
an untested distribution appear verified by TinyWarden.

Identity is `(id, version, content_sha256)`. Different content for an existing
ID/version is rejected; identical content is an idempotent import. ZIP timestamps,
compression and directory entries do not determine executable identity.
Compute content SHA-256 over ASCII `tw-skill-content-v1` followed by a NUL byte,
then every regular file in bytewise path order: unsigned big-endian 32-bit path
length, UTF-8 path, unsigned big-endian 64-bit content length, and the file's raw
32-byte SHA-256. Include the manifest and all files, including tests/docs. A separate
archive SHA-256 identifies downloaded ZIP bytes. Neither hash proves safety.

## Schema and display subset

The optional [Skill Display API](skill-display.md) and
[metric-history contract](skill-metric-history.md) specify richer widgets on top
of these facts. They are not implemented yet. Their `display.json` sidecar leaves
SDK v1 observations and plain-fact fallback intact; it is part of content identity.

Use a documented closed subset of JSON Schema: `type`, `properties`, `required`,
`additionalProperties: false`, `items`, `enum`, numeric minimum/maximum, string
min/max length and array min/max items. No references, recursion, regex, executable
expressions, remote schema retrieval or custom validator plugins. All objects are
closed; every string/array has a finite bound; depth is at most eight. Reject
duplicate JSON keys, non-finite numbers and integers outside the exact JSON safe
integer range in all inputs/outputs. Integers used as timestamps are UTC milliseconds.

Settings are at most 64 scalar fields (boolean, bounded number/integer/string or
enum). Manifest metadata maps each field to label/help keys, unit and order.
The settings schema is a closed object with every field required and a matching
manifest default. `interval_seconds`, when present, controls cadence (60–86400).
Its schema must declare an integer with explicit minimum at least 60 and maximum
at most 86400. The app independently validates effective values before delivery;
an invalid stored installation becomes unavailable without blocking other skills.
When absent, the generic default is 300 seconds. `timeout_seconds` can lower
the collector wall limit. Other values are package-owned.
Observation/state schemas may additionally contain bounded arrays/objects. Cross-field
validation is supplied by the pure function, with structured field errors, not an
unbounded schema language. Engine schedule settings retain supported minimum and
maximum intervals; packages cannot opt out of scheduling/resource limits.

Catalogs contain bounded plain-text messages with named, typed placeholders. The
default locale is English; future locale files follow the same key/placeholder
contract. Rendering always escapes content and uses engine-controlled navigation.
No HTML, external images, scripts, custom styles, clickable package-supplied URLs
or secret inputs. Findings use stable reason keys, typed parameters, up to 64
display facts and up to 128 rows per table, retaining current disk coverage.
Truncation must be visible, never mistaken for a
complete observation. Normalized output is still untrusted data and is revalidated.

## Archive admission

The initial upload format is ZIP only. Enforce streamed limits on actual bytes:
10 MiB compressed, 20 MiB total unpacked, 8 MiB per file, at most 256 regular files,
eight path segments and 200 path bytes. Apply independent validation time/memory
limits. Declared ZIP lengths or compression ratios are not sufficient protection.

Reject absolute/drive paths, dot or empty segments, backslashes, NUL/control bytes,
duplicate paths including case-fold collisions, symlinks, hard links, device files,
sockets, encrypted entries and inconsistent archive records. Paths contain ASCII
letters/digits, `_`, `-`, `.` and `/` only. Reject executable/native archive payloads;
accepted extensions are `.py`, `.json`, `.md`, `.txt`, plus the exact `LICENSE` name.
Explicit directory entries may end in `/` but must satisfy the same path policy.
No extraction utility defaults, archive permissions or archive ownership are trusted.

Inspect/extract into a new private staging directory with no-follow path creation;
validate schemas, catalogs, entrypoints and identity without importing package code.
Publish read-only content atomically into a content-addressed directory, then commit
its database record. Orphan content is safe to remove; a database row must never
activate missing or partial content. Validation failure removes staging content.
Both control plane and agent independently check the transferred package.

## Local lifecycle

App content is private ignored `var/skills/` beneath the configured main checkout;
agent content is beneath its existing private state directory in `skills/`.
Neither is a static web directory, another deployment checkout or a Git input.
Use private parent ownership/modes and immutable content directories. A package
receives no cache/storage path and cannot replace its own published bytes.

Install disabled. Show actual name/version/source claim, compatibility and requested
access. Activation requires an authenticated administrator to approve the exact
digest and grants. Enabling a different version requires a new approval, even if
its claimed version/name looks familiar. Agents additionally enforce local ceilings.
No install/uninstall/upgrade hook, `pip`, shell setup script or service definition
is executed. Validation alone is not approval to execute.

One active version per installation is supported first. Preserve previous content,
referenced schemas/catalogs and historical assessments. Uninstall removes current
assignment authority, not retained records. The initial store caps installed
versions at 100 and total unpacked content at 1 GiB; reaching either limit blocks
import without evicting referenced content. Automatic package garbage collection
and arbitrary settings/state migrations are later capabilities.

## Current native administration

The privileged local `npm run skills -- DATABASE ACTION ...` command uses the
configured database and an ephemeral authorization for the existing administrator;
it removes that authorization before exit. It is not an HTTP upload interface.

| Action | Arguments / effect |
| --- | --- |
| `import` | Prepared directory; optional `--official` for a reviewed TinyWarden artifact. Admit and install disabled, without selecting an update. |
| `migrate-legacy` | Directory containing the four official packages. One explicit, atomic conversion preserves current values, enablement, field override intent and original retained trim context. Legacy history stays unchanged. |
| `enable` / `disable` | Installation UUID and exact content SHA-256. Enabling additionally requires `--approve-declared-grants`. |
| `select-version` | Installation UUID, admitted content SHA-256 and `--approve-declared-grants`. Requires an identical settings schema and validates defaults plus all current overrides before selection. |

Each selection invalidates previous assignment authority and resets remembered
state; historical observations/assessments keep their original digest/catalog.
Changing schema or applying arbitrary state migrations is rejected/deferred, not
silently coerced. Shared UI defaults and host fields use optimistic counters and
exact uncertain retries. Their counters are authority tokens, not user rollback UI.

The canonical SDK/official sources are in tinywarden-agent. App runtime/skills is
a pinned trusted asset copy; test-only official fixture data records package content
digests. Neither ordinary import nor agent delivery reads a sibling Git checkout.

## Web installation and delivery

On Skills, choose **Add skill**, select the archive and upload the ZIP.
A new skill starts off. Review its publisher, license, version, content identity and host
access. Approve access and enable that version separately. ZIP uploads cannot claim
the reserved `tinywarden/` namespace or official compatibility aliases. No upload
can run an install hook, install dependencies or obtain credentials.

Uploading another version keeps the selected version, enablement and settings.
The upload dialog immediately offers the uploaded version for review. Confirming
**Update skill** selects it; closing the review leaves the current version active.
Re-uploading the same ZIP resumes an unconfirmed review. Selection requires a
matching settings schema and fresh digest-specific
access approval; incompatible schemas are rejected. Saved defaults and individual
server overrides stay intact. Old observations retain their original package catalog.

The app freezes a canonical ZIP in private `var/skills/.archives/`, with an archive
digest separate from the executable content digest. Existing prepared imports can
be re-admitted to add transport metadata without changing their installation. The
agent requests only a currently leased, enabled assignment using its own credential.
It refuses redirects, excessive or changed bytes, then independently validates and
atomically publishes the package under its private state `skills/` directory.
Downloads share the one fair skill worker; heartbeat remains independent. An
interrupted download leaves no published package and retries within a minute;
uncertain results continue to use the existing durable run identity and queue.
New compatible skills require no app/agent source change, rebuild or restart.

ZIP v1 accepts stored or deflated single-disk archives, including checked data
descriptors. ZIP64, encryption, executable prefixes, overlapping/gapped records,
ambiguous names and unsupported compression are rejected. Limits apply to actual
compressed/extracted bytes. Four download transfers (each at most 10 MiB/15 seconds)
and two uploads (each at most 10 MiB/15 seconds before admission) bound concurrent
transport resources. Native admission has its own CPU/memory/time limits.
