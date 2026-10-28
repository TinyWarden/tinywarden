# Skill action package contract

Format/sdk 3 adds optional independently permissioned actions. The published SDK
validator and author tools support this metadata; runtimes that advertise only
SDK 1/2 do not. Use managed agent 0.0.22+ and a compatible app; host execution
requires `skill_actions.v1` independently of monitoring. Start with
[the author guide](../../build-skills/actions.md) and [compatibility](compatibility.md).

## Static descriptor

`actions` is an array of at most16 entries, each with exactly these fields:

| Field | Contract |
| --- | --- |
| `id`, `version` | Unique lowercase dot/underscore identifier,2–64 characters; positive integer version≤65535 |
| `name_key`, `description_key` | Existing catalogue entries without parameters |
| `execution_class` | `unprivileged` or `host_admin`; neither is a monitoring capability |
| `requires_approval`, `requires_monitoring` | Booleans; declarations cannot bypass platform authority |
| `prepare_effect` | `none` or `changed`; preparation may itself require elevated trust |
| `verification` | Optional `local` or `host_health` (default). Requires agent 0.0.24+ when present. Policy is pinned in the descriptor digest. |
| `entrypoint` | Admitted `.py` file beneath `actions/`; fixed `prepare`, `fetch`, `apply`, `verify`, `inspect` functions |
| `prerequisites` | At most16 closed executable/module records; no commands or automatic installation |
| `schemas` | Exact `input`, `plan`, `result`, `recovery` paths to admitted JSON schema files |
| `review` | Closed `facts` and `tables` metadata; bounded schema property bindings |
| `result_facts`, `recovery_facts` | Scalar schema property bindings with catalogue labels and shared kinds |

Executable prerequisites contain `kind: "executable"`, `id`, `path`, `package`.
Paths are canonical executables directly under `/usr/bin/` or `/usr/sbin/`.
Module prerequisites contain `kind: "python_module"`, `id`, `module`, `package`;
the module is one identifier. The package name is an installation hint. Probing
availability must not execute the named command or import the named module.

Action schemas use the closed [package subset](package-format.md), additionally
allowing boolean `nullable` and arrays of at most5000 entries. Each schema is≤64KiB,
depth≤8 and≤256 schema nodes. Top-level inputs/plans/facts are non-null objects.

Schema nodes may carry `label_key` and `help_key` for inert catalogue labels in
the shared input form. Entries have no message parameters. Enums contain scalar
JSON values; number enums compare numeric values. Integer inputs use integer JSON
tokens. Nullable controls, optional fields and bounded arrays use shared controls.
Normalized action results are limited to48KiB after ASCII and HTML-safe escaping,
leaving room for the64KiB bound event. Recovery facts retain their64KiB limit.

## Fleet action discovery

The app's individual **Manage server** and bulk **More actions** menus expose one
**Skill actions…** entry when the explicit target selection has an available action.
The picker uses admitted package metadata and exact action grants. Discovery reads
do not import action code, prepare work, extend permission or create a job.

Groups use installation UUIDs; their headings resolve the manifest's `name_key`
through its admitted catalogue. Rows use the action's `name_key` and
`description_key`. Equal heading labels show canonical skill IDs. Groups sort by
display name, then skill ID and installation UUID; rows retain manifest declaration
order. Action selection uses the grant UUID, never the visible name or a bare
action ID. Package text is bounded catalogue data rendered through shared controls.
An empty or whitespace-only skill/action name omits that picker choice. Such text
is allowed by catalogue admission and does not invalidate the surrounding Fleet
read or hide other well-formed choices.

An action appears when at least one explicit target is eligible. Partial selections
show an eligible count, and preparation preserves the selection for affected/skipped
review. A parameterless single-server action with `requires_approval: false` starts
on selection; the command contains only that server, independently of bulk checks.
Failed/stale discovery suppresses selection. Current authority is rechecked
on submission; displayed availability/counts do not grant execution permission.

This is an app-owned extension surface using the existing format3 `actions` array.
There is no manifest menu-location field or arbitrary menu-injection API. Compatible
action changes are independently released packages; the app and host agent need
no per-action registration. Use the human
[menu-authoring procedure](../../build-skills/actions.md#add-items-to-fleet-skill-actions).
The [Fleet read contract](../fleet-management.md#skill-action-menu-metadata) owns
the exact presentation projection; execution bindings and agent HTTP/SDK calls
are unchanged by menu presentation.

## App endpoints

All operator writes require an administrator session, same-origin request controls
and an idempotent request ID. Monitoring approval never grants action permission.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v2/operator/skills/:id/actions` | Read the selected package's admitted actions, exact descriptor identity and current permission revisions |
| `POST /api/v2/operator/skills/:id/actions` | Allow/revoke one action, comparing content digest, descriptor digest and expected permission revision |
| `POST /api/v1/operator/fleet/maintenance` | Create preparation with `grant_id`, content/descriptor digests, permission revision, exact `input_json` and explicit server targets/revisions |
| `POST /api/v1/agent/maintenance-jobs` | Separate authenticated schema2 action lane; full binding on every job event, bounded declarative prerequisite pages on idle polls |
| `GET /api/v1/agent/maintenance-jobs/:id/package` | Download that job's pinned archive with authenticated server/agent/generation scope and exact archive/content hashes |

On the skill route, `:id` is the installation UUID. GET returns
`schema_version: 1`, `as_of`, `installation_id`, `content_sha256`, `actions` and
`access`. Each action has its admitted `snapshot`, verified `origin`, nullable
`grant_id`, revision (`"0"` before the first grant) and `enabled` flag. POST accepts
exactly `schema_version: 1`, `request_id`, `content_sha256`, `action_id`,
`descriptor_sha256`, `expected_revision` and boolean `enabled`, within4KiB. It
returns `grant_id`, `revision`, `enabled` and `content_sha256`. Same request IDs
replay only an identical mutation; stale revisions or changed selected bytes fail.

Fleet creation accepts `schema_version: 1`, `request_id`, `grant_id`,
`content_sha256`, `descriptor_sha256`, `permission_revision`, `input_json` and
`targets: [{id, revision}]`. The whole HTTP body is limited to128KiB, input JSON
to64KiB and targets to100 distinct server UUIDs. Revisions are decimal strings.
Creation returns201 with the operation UUID; it does not approve installation.

Agent polls/events use `schema_version: 2`, `host_id`, `agent_id`, `generation`,
nullable `job_id`, `sequence`, `kind`, `data` and the job's `binding`; the entire
request is limited to64KiB. Binding fields are `installation_id`, `skill_id`,
`content_sha256`, `action_id`, `action_version`, `descriptor_sha256`,
`permission_revision`, `settings_revision`, `settings_sha256`, `input_sha256` and
`origin: {github_id, owner_id}`. Idle polling has no job binding. Downloads require
the current agent credential and refuse changed pre-start authority, wrong scope,
symlinks or corrupt archives; already-started work keeps its pinned recovery code.
Successful ZIP responses identify both archive and content digests in
`X-TinyWarden-Archive-SHA256` and `X-TinyWarden-Content-SHA256`; the archive is
limited to10MiB. This route carries package bytes only, never a shell command.

The existing plan review, approval, cancellation, attention and recovery endpoints
retain their lifecycle roles; see [maintenance endpoints](../maintenance-actions.md).
Schema1 remains closed for historical work. A host cannot switch to the generic
worker while an older transaction remains unfinished or uncertain. Action artifact
downloads and root polls do not renew monitoring freshness or authenticated contact.

Readiness requires fresh recognized installation evidence, the exact current app
grant, a root worker report and the local publisher/class ceiling. Prerequisite
probes contain data only and never import package code. Pages hold32 probes and an
opaque UUID cursor. SDK3 monitoring support negotiates `skill_packages.sdk3.v1`
separately; selecting a new SDK3 version is held until its affected active/paused
server scope supports it, preserving the previous selected monitor.

## Recovery HTTP calls

Current package-bound recovery uses a separate scoped recovery bearer token and
JSON `schema_version:2`. It does not reuse the agent credential. The three calls
return `{schema_version, recovery_id, scope, expires_at, state,
acceptance_sha256, finalization_sha256}`, with nullable receipt digests until the
corresponding transition. The full request/reply bound for this lane is 512 KiB.

| Method and path | Exact request fields |
| --- | --- |
| `POST /api/v1/maintenance-recovery/describe` | `schema_version` only |
| `POST /api/v1/maintenance-recovery/accept` | `schema_version`, exact saved `scope`, nullable `local_attempt`, `journal_state`, `audit` |
| `POST /api/v1/maintenance-recovery/finalize` | `schema_version`, `recovery_id`, `acceptance_sha256`, `local_release` |

Scope retains host/agent/generation, recovery/job/operation IDs, action and provider
version, job expiry, revision, nullable plan/provider/approval/attempt identities,
and the exact `binding`, `input_json`, `settings_json` and pinned `archive`.
Audit is `{boot_id, integrity, process_running, facts}`; facts match the pinned
package's recovery schema and retain typed values. Local release is
`{job_id, local_attempt, released:true, audit}`. Acceptance and finalization must
agree on scope and local attempt; changed retries fail. Inspection does not
reapply the operation. Schema 1 remains a historical compatibility contract.

Exact decoders: [recovery validation](../../../server/maintenance/recovery-validation.ts),
[authorization and replies](../../../server/maintenance/recovery-authority.ts) and
[agent wire types](https://github.com/TinyWarden/tinywarden-agent/blob/main/internal/maintenance/recovery_contracts.go).

## Revocation and settlement

New jobs pin package/descriptor/catalogue, origin, permission revision, raw inputs,
effective settings, installation enablement and server monitoring epoch. Each
pre-start check compares the current authority. Disable/re-enable cycles and
dependent pause/resume cycles cannot revive older queued intent. An action that
requires no monitoring may run while monitoring is paused; that case explicitly
records local verification without claiming monitored service health.

An already started transaction keeps its original package and may report and
settle after permission revocation. It still needs its native verification. The
default `host_health` policy also needs new signed platform/contact evidence; revocation does not manufacture success or
interrupt an uncertain process. Recovery uses the original inspector and schema,
exact typed JSON facts/digest, then app acceptance → local release → finalization.
Never substitute the current package or clear a fence because time elapsed.

## Private action state

Every invocation receives `context.state_fd`, an open private directory for that
job, retained across preparation, staging, apply, verification and recovery. Use
ordinary descriptor-relative Python file operations; do not depend on the agent's
folder names. The parent path is root protected. The leaf is mode0700, owned by root
for `host_admin` or the action user for `unprivileged`; links, changed ownership and
unexpected permissions are refused before importing action code.

After a terminal job is acknowledged and its journal is durably archived, the
platform releases its staging workspace, safe-phase artifacts and unused pinned
package cache. It retains the immutable apply/core receipts that prevent replay.
Attention, active workers, an uncertain fence or pending recovery block this cleanup.
Local uninstall/purge also requires the existing safe mutation boundary; it never
uses cleanup to bypass unfinished recovery. The app retains historical display
under its configured retention policy.

## Python action entry points

The admitted entrypoint module defines `prepare(arguments, context)`,
`fetch(arguments, context)`, `apply(arguments, context)`,
`verify(arguments, context)` and `inspect(arguments, context)`. Modules in the
same archive are imported through `action_package`, for example
`from action_package.actions import helpers`. The platform admits their syntax
without importing them during catalogue discovery, permission review or probes.

`arguments` contains decoded `input`, effective `settings`, `plan`, `receipt`
and `context` (binding, scope and job ID). `plan` is absent (`None`) in prepare
and inspect; `receipt` is supplied only to verify. Input and settings JSON are
each limited to64KiB. Never infer permission from an input field or package code.

| Entry point | Exact return contract |
| --- | --- |
| `prepare` | `{plan_json, has_changes, effect, result}`. `plan_json` is a JSON string matching the declared plan schema, at most4MiB before decoding. `has_changes` is boolean; `effect` is `none` or `changed`. A plan is required. A plan with changes has `result: None`; a no-change plan may provide a normal result |
| `fetch` | `{downloaded: True, plan_sha256: context.plan_sha256}` after verifying staged artifacts against the exact saved plan |
| `apply` | `{effect, reason, local_verified, process_running, facts, receipt_json}`. `effect` is `none`, `changed` or `unknown`; `reason` is `None` or `{key, params}` matching a declared catalogue message and its typed parameters; facts match the result schema; flags are booleans; receipt is a JSON string or `None` |
| `verify` | `{verified: True}` only after inspecting the saved receipt and actual post-action state; a monitoring result from before the action cannot verify it |
| `inspect` | Call `context.commit(facts)` once while holding required native locks, then return `None`. Facts match the recovery schema and fit64KiB. Inspection receives no original plan and never repeats application |

`context.binding`, `scope`, `job_id`, `phase` and `plan_sha256` identify the pinned
operation. `context.read_package(path)` returns exact admitted archive bytes.
`context.check_start()` validates the current boot-bound, short-lived apply
authorization; call it immediately before the irreversible operation while native
locks remain held. It does not grant permission outside apply or renew a deadline.
`context.guard_fd` exposes the inherited mutation guard only for `host_admin`.
`context.start` holds the supplied apply authorization
(`job_id`, `attempt_id`, `boot_id`, `not_after_ms`)
or `None`; use `check_start()` to validate it rather than modifying it. Its presence
does not replace the platform's permission checks.
The job workspace descriptors are described below.

For a structured domain refusal, import `ActionFailure` from `skill_actions` and
raise `ActionFailure(reason, facts, effect="none", receipt_json=None)`. Facts must
match the result schema and the reason must resolve in the package catalogue.
Use `changed` or `unknown` honestly after a partial or uncertain operation; this
exception never authorizes an automatic retry. Arbitrary exception text is not
shown to operators. Normal results have the same48KiB normalized wire bound.

After successful preparation, a later failure reporting `none` retains the
descriptor's declared `prepare_effect: changed` in the saved job and Fleet result.
This includes download failures and refusals before apply starts. A refusal before
preparation succeeds can still report `none`; `unknown` remains unknown. This
aggregation is generic and requires no package-specific failure handling.

Keep a durable, job/package-bound receipt in the private workspace before reporting
an irreversible start. Verification and read-only inspection must distinguish
successful application, partial failure and absent/uncertain evidence. The platform
owns the immutable core apply receipt and fences; the package owns its domain
receipt and native safety checks. Missing state cannot authorize a repeated apply.

Host administrator actions also receive `context.state_path` for native libraries
that require an absolute directory. It is `None` for unprivileged actions; those use
`state_fd` without access through the protected parent directories. Action code
must keep its staged state/recovery receipts coherent and must not treat a missing
or partial receipt as permission to repeat an uncertain apply.
The total expanded action metadata is bounded to384KiB, including resolved schemas.
No references, regular-expression programs or executable validators are admitted.

Fact bindings contain `key`, `label_key`, `kind`; supported kinds are `text`,
`number`, `boolean`, `bytes`, `sha256`. Review supports≤8 facts and≤8 tables. A table
has `id`, `label_key`, `source`, `columns`, with1–8 scalar columns bound to its
top-level array's object schema. `coverage` is reserved for platform verification.
The source property must be required and nonnullable, and its object items must
be nonnullable. Admission rejects unsupported bindings with
`action_review_table_schema`. Return an empty array for a known empty table;
nullable scalar columns remain supported for unknown values within a row.
Fleet names the selected table in an empty review instead of describing it as a
missing monitoring reading. Result presentation omits absent/null declared facts
only before an apply attempt, when neither process-running flag is set and the
effect is known and does not report package changes. Known values including zero
and false remain visible. Started, running and uncertain results retain unknowns.
For the shared `no_changes` phase, an `outcome` fact with that exact value uses the
localized phase label; other scalar text remains literal. This presentation does
not change saved results, package schemas, authority or SDK calls.
No callback, raw HTML, style declaration or SQL fragment is accepted.

The action descriptor digest covers its descriptor plus resolved schemas using
ASCII canonical JSON. The package content digest also covers exact source/schema
file bytes. Static admission checks the declared functions using Python syntax
inspection and imports no package code. The executable authorities are the SDK
[descriptor validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/actions/descriptor.py)
and [schema validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/actions/schema.py).

## Host publisher policy

In the managed agent, root configures the local ceiling with the managed
configuration path and immutable GitHub repository/owner numeric IDs:

```sh
sudo /opt/tinywarden-agent/current/tinywarden-agent maintenance \
  --config /opt/tinywarden-agent/config.json --action-policy \
  --origin REPOSITORY_ID:OWNER_ID --allow host_admin
```

Use `--allow unprivileged` for that separate class, or `--deny CLASS` to revoke a
class. The CLI validates and atomically writes
`/opt/tinywarden-agent/updater/private/action-policy.json` with mode0600 under the
common mutation guard. It requires the recognized managed installation; do not
hand-edit the file while an operation is running. The closed shape is
`{schema_version: 1, origins: [{github_id, owner_id, classes}]}`. IDs are positive
decimal strings; at most64 unique repository/owner pairs are allowed. `classes`
contains only `unprivileged` and/or `host_admin`, without duplicates. No policy
means no action permission. A local allow still needs the app's exact package
grant and the operation's required approval. Revocation blocks a pending start;
it does not erase an already started transaction's pinned recovery evidence.

## Monitoring compatibility

SDK3 retains the four monitor functions. Packages declaring resource collections
use the existing SDK2 resource lifecycle; packages without them use the scalar
lifecycle. Formats1/2 retain their original contracts and reject the `actions`
member. Read-only monitoring never receives action execution permissions.
The package SDK number does not select the monitoring wire version: scalar
reports use version1 and resource-collection reports use version2, including SDK3.

## Identity and execution boundary

Invocation binds installation, skill ID, exact content/descriptor digests, action
ID/version, permission/settings revisions, input/settings digests, verified origin,
host, agent, generation, job and phase. Input/settings/plan/receipt JSON travels as
bounded strings; digests cover exact UTF-8 bytes before decoding. Cross-language
number reserialization must not change an approved identity. See the executable
[closed envelope](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/actions/envelope.py).

Metadata and schema validity grant no execution authority. Host-administrator
packages are trusted root software, with separate exact-digest permission, local
class/origin policy and transaction approval. Monitoring installation, an Official
badge or a new catalogue entry cannot approve that privilege. Generic process and
receipt protections defend against interruption and accidental replay; they cannot
constrain intentionally malicious administrator-trusted root code.


## Choosing verification

`verification: "host_health"` (also the default when omitted) captures monitoring
coverage before the action and requires fresh applicable checks and platform/contact
evidence after it. Use this for actions whose success depends on overall host health,
such as installing OS packages. The existing no-monitoring action behavior on a
paused host remains available.

`verification: "local"` uses the skill's `verify` result and durable receipt. It
skips unrelated monitoring runs and a new post-result platform/heartbeat report;
it does not claim monitored services are healthy. Use it when the action's explicit
postcondition can be established locally, such as refreshing indexes and reading
available updates. Failed or uncertain verification cannot become success.

This policy is independent of `requires_approval` and `requires_monitoring`.
Both policies retain current exact-package permission checks before start, known
agent identity, generation fencing, native locks, one-use apply authority, recovery
and no-replay settlement. Adding the optional field changes the descriptor digest
and needs a new immutable skill version and fresh action permission. Any explicit
value requires managed agent 0.0.24+; the app rejects older target scopes before
activation. Omitting it preserves older SDK3 descriptor compatibility.
