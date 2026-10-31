# Maintenance action contracts

Maintenance actions perform explicit administrative changes on a host. Read-only
monitoring approval never grants action authority. Signed agent self-update retains
its separate release protocol. Fleet maintenance windows suppress notifications.

<a id="independently-delivered-actions-in-the-source-platform"></a>

## Independently delivered actions

The released platform admits actions from format/sdk 3 packages. The
package owns domain operations, native libraries, policy, review schemas, results
and inspection. The universal agent owns authenticated delivery, exact artifact
identity, permission/start checks, process supervision, durable core receipts and
recovery transport. Compatible additions and updates require only a skill release.
The Updates skill owns Refresh package lists and Upgrade packages.
There is no new-work fallback to the historical compiled APT provider.

Use managed agent 0.0.22+ with a compatible app. Hosts must advertise
`skill_packages.sdk3.v1` for SDK3 monitoring and `skill_actions.v1` for actions.
An administrator allows each exact package/action digest; a separate protected
local publisher/class policy sets the host's execution ceiling. Preparation and
application recheck that authority. Monitoring, action permission and exact-plan
approval are distinct decisions. Root package code and package maintainer scripts
require administrator trust; signatures establish provenance, not harmlessness.

The [action package reference](skills/actions.md) owns descriptor fields, all new
endpoints, Python entry points, limits and workspace/receipt contracts. The existing
Fleet lifecycle endpoints below remain shared. For current actions, creation
uses `schema_version: 1`, `request_id`, `grant_id`, `content_sha256`,
`descriptor_sha256`, `permission_revision`, exact `input_json` and
`targets: [{id, revision}]`; a raw historical `action` request is rejected.
This creation body is limited to128KiB (input JSON itself to64KiB);
the retained schema1 creation shape below had the earlier32KiB body limit.
Generic review table IDs come from the saved descriptor (plus platform `coverage`),
not the historical fixed package table names. Worker events and recovery requests
use schema2 with the exact package/action binding; schema1 remains closed for old
work. Server settings, enablement and permission revisions fence stale queued jobs.

During cutover, drain already delivered old work under its retained signed agent,
or leave it explicitly fenced for read-only recovery. New delivery cannot revive
unbound old jobs. Retain historical readers, immutable receipts, pinned artifacts
and recovery authority until settlement. Do not replace an agent or purge its
workspace to clear an uncertain transaction. Rollback requires first settling or
fencing newer-format work; an older agent cannot interpret SDK3 work. Review the
[compatibility reference](skills/compatibility.md) before selecting package versions.

## Exposed API and SDK boundary

Single-server package actions use one persistent progress dialog, including inline
review and explicit plan approval when declared. Parameterless selection starts
preparation; actions declaring `requires_approval: true` wait for current exact-plan
approval before application. Other actions proceed under their existing action grant.
Launch and reopening carry advisory display context; authenticated operation reads
remain authoritative. The dialog can be hidden while a request is pending without
discarding its command controller or exact retry identity. Closing never starts,
cancels or repeats work. Reloaded links route directly to the maintenance reader;
the UI does not display intermediary operation or maintenance-loading dialogs.

Background reads retain the last value and preserve focus. They do not by themselves
disable commands; failed/expired/outdated authority and an actual pending command
still fence writes. Mutation endpoints independently check revisions and scope.
Automatic polling stops only when every item is terminal (or rejected without a
job), no item is pending, and no attention, recovery or native process remains.
An interrupted read preserves the last known state with a retry notice. Recovery
remains available under Troubleshooting, including delivered cancelled/expired work
that awaits the agent. Its explicit confirmation and CLI authorization are unchanged.

The [action verification contract](skills/actions.md#choosing-verification) uses
only the executing skill's evidence, independently of approval. Unrelated monitoring
and a new post-result heartbeat never gate settlement.
An explicit policy needs agent 0.0.24+. The generic
[work waiting endpoint](agent-endpoints.md#prompt-action-delivery) reduces delivery
delay without delivering authority or renewing contact. Current agent calls and
schema 2 recovery are listed in the [endpoint index](agent-endpoints.md) and
[action contract](skills/actions.md#recovery-http-calls).

### Operator endpoints

All endpoints in this table require a current Admin session, including reads.
POST requests also require the configured application `Origin`,
`X-TinyWarden-Request: 1` and a JSON body containing `schema_version: 1`.
Cross-site browser writes are rejected. UUIDs identify requests, hosts, operations,
jobs, plans and recoveries; revisions are decimal strings. Unknown body fields
are rejected. Creation is limited to 128 KiB (including at most 64 KiB of input
JSON); other writes are limited to 32 KiB, except recovery revocation at 1 KiB.

| Method and path | Input beyond `schema_version` | Successful response / effect |
| --- | --- | --- |
| `POST /api/v1/operator/fleet/maintenance` | `request_id`, `grant_id`, `content_sha256`, `descriptor_sha256`, `permission_revision`, `input_json`, `targets: [{id, revision}]` | 201: operation `id` and access metadata. Queues the bound skill action for explicit hosts; does not grant plan approval. The historical bare `action` creation body is rejected. |
| `GET /api/v1/operator/fleet/maintenance/:id` | Operation UUID; no query parameters | 200: operation, per-host items/results, recovery summaries and ordered approvals, with `as_of` and access metadata. May settle existing progress; does not approve or execute package work. |
| `GET /api/v1/operator/fleet/maintenance/:id/plans/:plan` | Operation and plan UUIDs; optional `table` and `page` | 200: saved plan identity/digest/expiry, description, facts, table definitions and one page of review rows. Table IDs come from the saved descriptor, plus platform `coverage`. Defaults to its first table (or coverage), page 1; 25 rows per page. |
| `GET /api/v1/operator/fleet/maintenance/:id/jobs/:job/logs` | Operation/job UUIDs; optional `page`, or `copy=1` | 200: bounded saved stages and captured native diagnostic text, receipt times and pagination/full transcript export. Admin-only; no private job inputs or receipts. See [logging](skills/actions.md#logging-http-calls). |
| `POST /api/v1/operator/fleet/maintenance/approve` | `request_id`, `operation_id`, ordered `targets: [{job_id, plan_id, digest}]` | 200: approval `id`, `operation_id` and access metadata. Pins exact plans and the canary/serial execution order. |
| `POST /api/v1/operator/fleet/maintenance/control` | `request_id`, `operation_id`, `action: cancel\|acknowledge`, `targets: [{job_id, revision}]` | 200: control receipt `id`, `operation_id` and access metadata. Applies the phase-specific cancellation or attention acknowledgement rules. |
| `POST /api/v1/operator/fleet/maintenance/:id/recovery` | `request_id`, matching `operation_id`, `job_id`, `revision` | 200: recovery scope/state/expiry and a token on first issuance. An identical retry returns `token: null`. |
| `POST /api/v1/operator/fleet/maintenance/recovery/:id/revoke` | Only `schema_version`; path identifies the recovery | 200: revocation receipt. Only an authorization not yet accepted can be revoked. |

Create/approve/control accept 1–100 unique targets. Reuse the same request ID and
content after a lost response; changed content with an existing ID conflicts.
Approval uses the plan digest returned by the review API, not a digest of displayed
rows. Recoveries have their own acceptance and retry rules described below.

These operations also appear in the existing [Fleet Activity API](fleet-management.md)
under `kind: maintenance_action`. The separate
`POST /api/v1/operator/hosts/:id/maintenance` endpoint manages notification
maintenance windows; it does not request package work.

The current executable definitions are the
[HTTP handlers](../../server/http/maintenance-handlers.ts),
[creation validation](../../server/maintenance/validation.ts),
[plan reader](../../server/maintenance/review.ts),
[approval](../../server/maintenance/approvals.ts),
[control](../../server/maintenance/control.ts) and
[recovery handlers](../../server/http/maintenance-recovery-handlers.ts).

## Historical schema 1 contracts

**The remaining sections describe the historical 0.0.19/0.0.20 schema 1 workflow
and its recovery contracts.** Those releases built domain providers into the app
and signed host executable. Agent 0.0.20 added protected local mirror-list support
inside that provider. The current agent does not embed it or accept new jobs through
the old creation shape. Use the [action reference](skills/actions.md) for current
package-owned execution and schema 2 transport. Historical records and retained
signed agents keep their original recovery meaning; monitoring permission never
invokes them.

### Agent and recovery endpoints

| Method and path | Authority and input | Successful response / effect |
| --- | --- | --- |
| `POST /api/v1/agent/maintenance-jobs` | Current agent bearer credential; `schema_version`, `host_id`, `agent_id`, `generation`, `job_id`, `sequence`, `kind`, `data` | 200: matching scope, `maintenance_jobs.v1` capability, server time, acknowledged sequence and a job delivery or `null`. Polls and typed immutable events share this endpoint. |
| `POST /api/v1/maintenance-recovery/describe` | Scoped recovery bearer token; `{schema_version: 1}` | 200: recovery scope, expiry, state and receipt digests. Describes authority without authorizing execution. |
| `POST /api/v1/maintenance-recovery/accept` | Same recovery bearer; `schema_version`, exact `scope`, `local_attempt`, `journal_state`, `audit` | 200: accepted recovery receipt. Records clean native inspection while retaining the app fence until finalization. |
| `POST /api/v1/maintenance-recovery/finalize` | Same recovery bearer; `schema_version`, `recovery_id`, `acceptance_sha256`, `local_release` | 200: finalized receipt after the matching local release. Clears recovery fencing without replaying the original work. |

Agent/recovery bodies are limited to 64 KiB. Recovery endpoints reject query
parameters and accept only the three named modes. Recovery tokens cannot replace
agent credentials or authorize arbitrary commands. Never put either bearer in a URL.

The executable definitions are the [HTTP handlers](../../server/http/maintenance-handlers.ts),
[operator input validation](../../server/maintenance/validation.ts),
[approval](../../server/maintenance/approvals.ts) and
[control](../../server/maintenance/control.ts) validators,
[agent wire validation](../../server/maintenance/wire.ts),
[shared contracts](../../lib/maintenance/contracts.ts), and
[recovery handlers](../../server/http/maintenance-recovery-handlers.ts),
[contracts](../../lib/maintenance/recovery.ts) and
[validation](../../server/maintenance/recovery-validation.ts).
These define exact event-specific data and receipt shapes. The shared error
envelope contains `schema_version: 1`, `error.code` and `request_id`; access,
stale scope, changed-plan and retry conflicts retain their distinct codes.

## Action identity and readiness

New actions come from immutable admitted package descriptors and exact action
grants. The app does not register domain action IDs. It checks the reported managed
agent binary/runtime/descriptor against the signed release catalogue, local worker
policy and current action readiness. SDK3 uses `skill_actions.v1`; historical
`maintenance_jobs.v1` records remain readable but cannot create new work.

Each descriptor declares prerequisites. Missing prerequisites do not disable
monitoring or agent updates, and are never automatically installed. Updates 1.3.0
needs only `apt-get` from `apt` for its actions, with no Python APT binding.
Explicit retired `host_health` policies cannot receive a new action grant/start.

The server's Agent settings/details read includes a bounded `maintenance_actions`
projection for each registered action: a state and `missing_packages`, plus report
and validity instants. It uses existing host-access/session authorization. Only
fresh reports matching the signed catalogue may recommend prerequisite packages;
admitted descriptor metadata maps prerequisite IDs to installable package names.
Unknown/future/stale reports, unavailable catalogue, unrecognized installation,
unsupported agent, unavailable worker and host/action conflicts remain distinct.
Expired or failed browser reads hide package advice. This read does not enqueue
work, alter update policy or install prerequisites.

The package actions are `packages.refresh.v1` and
`packages.upgrade_conservative.v1` (displayed as Upgrade packages). Its plain-upgrade policy preserves package holds and
excludes additions, removals, downgrades and automatic repair. Refresh authorizes
index updates; preparation and package-install approval are distinct intents.

## Durable records and fencing

The maintenance domain owns per-host jobs, immutable provider plans, immutable
approval receipts and ordered immutable events. Jobs bind the parent Fleet
operation, explicit host, agent, credential generation and provider version.
Approval binds exact structured content and the reviewed order, rather than a
translated summary or a mutable package count. Repeating an ID with different
content is a conflict.

A job records phase, attention, cancellation intent, mutation effect, potential
process activity and the irreversible apply attempt separately. An attention
threshold is not evidence that a native process stopped. Expiry must not release
an uncertain transaction. Unresolved work retains host fencing until reconciliation;
it cannot become a second install attempt because a browser or acknowledgement
was lost. Active details and recovery evidence must survive routine retention.

Before native writes, validate the exact action/plan/start authority. Domain command
policy belongs to the package. Updates 1.3.0 uses ordinary APT locking/resolution;
its package preview is not a frozen native transaction. The shared agent lock also excludes signed
installation changes; it preserves the existing deployed lock pathname.
Root package work must run independently of the web request and the signed
updater's five-minute service timeout. A package error can leave a partly changed
host. There is no automatic rollback, repair, reboot or immediate-stop guarantee.

## Plan identity and independent results

The package defines its plan schema, review facts/tables and meaning of approval.
The app hashes exact admitted provider bytes and binds approval to the action's
content/descriptor, settings/input, permission, host, agent/generation and expiry.
It does not interpret package names or invent stronger domain guarantees.

Every new verification envelope has `mode: "local"`, empty monitoring members and
an action-scoped digest. No other package's configuration or reading enters it.
The app neither starts manual monitoring runs nor compares before/after health.
A valid authenticated action result can settle without a fresh platform heartbeat.
Known failure remains failed; uncertainty/process activity retains recovery fencing.
Historical whole-host snapshots remain readable on old records only.

Bulk execution is serial. Later grants require the earlier action's own settled
success. Failure, uncertainty, changed own authority or expiry stops further
dispatch. Preparation may use bounded concurrency without authorizing installation.

## Transport, cancellation and cleanup

Current package-bound actions use authenticated `schema_version: 2` requests and
the `skill_actions.v1` capability, with the exact action binding described in the
[action transport reference](skills/actions.md#app-endpoints). Historical schema1
`maintenance_jobs.v1` messages remain closed for stored work; they cannot create
new package-bound operations. Both lanes carry host, agent, generation, job,
sequence, event kind and typed data. Polls use
sequence zero; at most256 immutable events belong to a job. Every non-poll event
must be the next sequence or an identical retry. A changed retry is a conflict.
The response repeats the scope and acknowledged sequence. A replay retains its
original decision, with fresh outer server time so a start grant cannot renew.

Agent event requests are limited to64KiB; schema2 replies are limited to512KiB
(historical schema1 replies retain their64KiB limit). Uploaded action plans are
limited to4MiB and transfer in ordered32KiB base64 chunks (at most128). Their exact
bytes, full digest and admitted schema must agree before approval; action-schema
arrays may contain at most5,000 entries. Summaries cannot substitute for the
approved plan. Result and recovery facts match their package-owned schemas and
respective transport limits. Historical domain-specific plan/result limits apply
only to those stored formats. Command output is separate diagnostic transcript
data, escaped as text and bounded/redacted by the generic capture contract. It
never supplies authority.

A final60-second start grant pins the immutable approval, host generation and a
single attempt. Authority, fresh recognized installation, the action's own scope,
plan expiry, host conflicts and reviewed predecessor outcomes are checked under
the shared access/package/host order. Another approval cannot bypass unfinished
work in the same operation. No transaction or database lock spans HTTP or APT.

Normal completion saves the authenticated terminal acknowledgement before removing
its local mutation fence. On restart, the root poller resumes removal of only that
exact acknowledged fence under the shared guard and worker-cgroup exclusion.
It retains the receipt and never invokes the provider again. A corrupt/mismatched
scope, uncertain result or pending recovery outbox remains blocked. Read-only
recovery closures use their separate ordered release protocol.

Cancel is explicit and replayable. Undelivered work can be cancelled immediately;
delivered pre-apply work keeps its reservation until the root worker acknowledges
a safe stop. Applying work receives Cancel remaining: verification continues and
later targets do not start. A timeout classifies uncertainty and never kills a
native package process. Verified, stopped terminal results release exclusion
automatically, including known failure; saved results remain available. Unknown
effects or an unconfirmed process require the separate recovery proof below.
Manual acknowledgement is accepted only with settled terminal or reconciled
evidence; it cannot bypass uncertainty. Neither release nor acknowledgement
changes a failed outcome into success.

The cleanup owner includes jobs, plans, approvals, events, upload parts, manual
verification links and scoped recovery authorizations/receipts. Terminal details follow configurable retention, default90 days.
Active or uncertain jobs and their linked Check now receipts are protected. Removed
host cleanup retains the existing durable purge-stage numbering; a shared approval
keeps only opaque ordered identifiers while another target still references it.

## Native command ownership

Updates 1.3.0 owns the APT behavior in its ordinary `actions/refresh.py`,
`actions/upgrade.py` and small `actions/command.py` helper. No APT resolver, archive
validator, disk/boot forecast or service-health gate lives in the agent/app.

Refresh runs strict `apt-get update --error-on=any`, then plain simulated upgrade.
Each native exit/output is retained, including a successful refresh with a failed
summary. Upgrade prepares a cached simulation, requests one command approval, then
runs ordinary `apt-get upgrade`. Its package list is explicitly a preview; APT
resolves again under its own native behavior when application starts.

Fixed command options prevent new packages/removals/downgrades/hold changes and
turn off automatic repair/removal. Configuration policy uses `--force-confdef` and
`--force-confold`; environment sets `DEBIAN_FRONTEND=noninteractive` and
`NEEDRESTART_MODE=l`. Administrator repositories and ordinary hooks remain native
APT configuration. Scripts may restart services or fail after partial changes.
No service disabling, automatic rollback or reboot is performed.

The package persists a running receipt before launching mutation and a terminal
receipt after the native command exits. It verifies its own receipt, never another
skill's state. Nonzero native exits are known failures with possible changes.
Lost/running receipts stay uncertain; inspection reads evidence and never retries
installation. The generic guardian retains exclusion until descendants stop.

Use [the user guide](../using/package-maintenance.md) for operation/approval details
and the [SDK reference](skills/actions.md) for every hook, context method and API.
The runtime still supports `prepare/fetch/apply/verify/inspect`; a fetch hook may
validate a no-op when the approved native command owns downloading. Internal hooks
must not invent separate user-visible download steps.

## Read-only reconciliation after revocation

A revoked agent credential cannot report old work, and replacement credentials
cannot inherit it. An enabled current Admin can issue a separate recovery
authorization for one retained job, old host/agent/generation, provider, plan,
approval, granted attempt and revision. It authorizes scoped read-only inspection and
closing that recovery transaction. It grants no package execution, enrollment,
command, repair, reboot or renewed apply attempt.

First acceptance expires after 15 minutes and rechecks the issuing Admin's current
authority and exact job revision. The token can be replaced/revoked before
acceptance. Once acceptance commits, that exact recovery cannot be recalled;
receipt delivery survives expiry or later Admin disablement. Each step has an
immutable digest: exact retries return the original decision, changed retries
conflict. Tokens are displayed once, stored as digests by the app and accepted
only by the separate bounded `/api/v1/maintenance-recovery/{describe,accept,finalize}`
lane. They do not count as agent contact or fresh check results.

The managed root CLI uses a hidden prompt or standard input:

```sh
sudo /opt/tinywarden-agent/current/tinywarden-agent maintenance \
  --config /opt/tinywarden-agent/config.json --reconcile
```

Use the actual managed installation path for a custom installation. Repeat the
same invocation to resume a saved recovery. `--authorization-prompt` requests a
replacement authorization through the hidden prompt; `--authorization-stdin`
reads it from standard input. These flags are mutually exclusive. Never place the
secret in an argument, URL or shell history. Unfinished exact requests and their
authorization are retained only in the validated root-private outbox; the secret
is erased after final acknowledgement.

The CLI verifies the signed managed executable and old retained installation
scope, acquires the shared host mutation guard and checks for lingering worker
cgroups/unsettled updater work. It then invokes the inspector from the exact
retained skill. Required domain checks and native locks belong to that inspector;
the generic CLI does not audit dpkg, compare package selections or certify services.

Updates 1.3.0 inspects its saved command receipt. A known native exit is reported as
recorded; a missing/running receipt reports an uncertain outcome. No refresh,
simulation, download, installation or repair runs during inspection. Runtime scope
or process uncertainty retains the fence. Separately authorized recovery can
release stopped work while preserving its original unknown/failed result; it does
not prove that packages are healthy or authorize replay. Historical inspectors
retain their own declared checks for historical work.

Release is ordered:

1. Root saves and submits the scoped read-only inspection. App acceptance retains
   the host/lifecycle/purge fence and Cancel remaining for the old batch.
2. Root repeats retained-scope and worker-exclusion checks under the common guard
   and invokes the skill inspector again. If that inspector needs native locks,
   it holds them through `context.commit`. Root durably closes old execution,
   clears/fsyncs only the matching local fence, then saves its local-release receipt.
3. App accepts that immutable receipt before clearing its recovery fence. Root
   retries lost acknowledgements without executing old work. The poller can retry
   saved released receipts, but cannot initiate an audit or clear a fence.

The package-owned inspection facts describe the evidence it actually checked. The
generic audit wrapper is not a package-database integrity verdict. Recovery is a
separate fact and never converts an original failed/unknown job into success,
asserts healthy services, fabricates check results or resumes a failed canary's
remaining targets. New package work needs current readiness and a fresh plan and
approval. The root journal has an explicit recovery closure; `local_verified` on
the original package result keeps its original meaning.

Unfinished accepted recovery protects its job, plan and receipts through normal
retention and purge. Completed recovery follows configurable retention, default
90 days. A deleted completed receipt is never recreated from a late retry. Local
release evidence remains historical; unavailable remote receipt history does not
restore a fence or authorize execution. Installer mutations remain blocked while
a recovery outbox is pending, preserving the ability to finish its delivery.

The token is scoped bearer authority from a current Admin; it does not provide a
separate cryptographic attestation of root execution. The signed local path
independently enforces retained identity, worker exclusion, skill-owned inspection
and fence ordering.


## Fleet review and presentation

Admin Fleet menus project the same admitted skill descriptors and readiness
rules as command admission. Individual and selected-server preparations name
eligible and skipped servers before submitting an immutable explicit scope.
Server-page Operations menus retry an unconfirmed availability read when opened;
a failed retry retains an explanatory read-only retry entry and saved history.
Only a fresh read restores launch choices. Dismissing a result notice does not
alter grants, readiness, task fencing or menu eligibility.
A parameterless single-server action starts preparation on selection. Upgrade
packages waits for approval of its stated command policy and exact saved plan IDs/
digests. Bulk review preserves explicit targets and chosen first-server order.

`GET /api/v1/operator/fleet/maintenance/:id` returns bounded summaries, receipt
facts and ordered approvals. The Admin-only `plans/:plan` review route pages all
the owning skill's declared tables in groups of 25. Historical monitoring coverage
remains readable only on old saved plans. It checks
operation membership and preserves the saved digest. Summary queries project
declared counts in PostgreSQL rather than loading every raw plan into Node.
Application-owned labels come from the catalogue; provider metadata supplies data,
not executable UI or markup. A new skill declares its review schemas/metadata; no app-specific adapter is needed.

One shared dialog advances through review, approval, cancellation and recovery.
Polling preserves ordinary focus; step changes focus the heading. Expired or
changed selected plans block approval. A lost write reply locks the dialog and
retries the exact saved request; it never substitutes a fresh action. Closing the
dialog neither approves nor cancels a job; its operation remains in Activity.

An individual action awaiting approval offers **Cancel operation** beside
**Approve and run** in the shared footer. This sends the existing revision-bound
cancel command for that one unstarted job directly, without a second confirmation.
The header **×** still closes the window without cancelling. Pending command and
uncertain-reply handling are shared with other controls; a cancellation request
does not release exclusion until the agent's safe-stop evidence permits it.

Recovery secrets are held only in component memory and displayed once. Clipboard
copy is explicit. The CLI command uses a hidden authorization prompt and contains
no secret; URLs, browser storage and subsequent API request bodies do not receive
the token. Expired/revoked authorizations are hidden and need replacement before
acceptance. After acceptance the same server resumes receipt delivery without a
new prompt. Finalization hides the command and retains the original outcome.


## Safe phase budgets and input ownership

The coordinator bounds each entire preparation and download phase to 30 minutes
with a boot-scoped CLOCK_BOOTTIME deadline, including suspend and time spent in
all metadata readers. It rechecks returned results between watchdog ticks too.
Cancellation unwinds safe native helpers and their fixed reader/download children.
Apply has no cancellation context or time-limit kill; its start grant is checked
before the one native transaction and never used to interrupt that transaction.

Before import, the generic runtime validates its admitted package, protected local
publisher policy and private job workspace. Updates 1.3.0 does not fingerprint
APT inputs, take temporary ownership of index directories or implement custom
mirror/archive handling. APT reads its native configuration and repositories.

The native app job `maintenance-jobs.mjs` runs a bounded fair classification sweep
from `tinywarden-maintenance-jobs.timer` about once a minute. It checks 10 jobs per
invocation, under the same access/package/host lock order. It classifies expiry,
attention and verification; it cannot issue approval, dispatch package commands,
kill a worker or release an uncertain fence. The job is built/pinned with the
immutable native job artifact and activated explicitly with the compatible schema.


## Historical jobs during migration

Jobs created by older agent-managed actions remain available in Activity. They cannot start another package operation after migration to skill actions. Work already running may report its final result. Uncertain work retains its server fence and must be reconciled with its retained signed agent before replacing that agent.

## Verified terminal release and recovery entry

A terminal result releases blocking attention when its current process is stopped,
no recovery exchange is pending, and either its known-effect result is locally
verified or a locked reconciliation proof already exists. Active, running, unknown
and unreconciled results remain fenced. Successful/no-change completion rejects an
unknown effect even if a caller marks it locally verified. Generic platform rules
apply to all skill actions; this does not weaken host locks or grant replay.
Manual acknowledgement and its UI eligibility use the same terminal proof; marking
an unknown effect locally verified is insufficient to acknowledge it clear.

Finalization uses this rule; authenticated job polling also releases eligible older
terminal attention under existing locks. It preserves the original phase/result,
updates the revision and records `maintenance_result_released` in Fleet audit.
The agent consumes the ordinary terminal reply and clears its native fence through
its existing durable acknowledgement; no new endpoint or SDK method is added.

Server/Fleet recovery entries distinguish terminal uncertainty from running work.
**Verify and unlock** opens the exact job's existing explicit read-only recovery
workflow in the foreground. Opening/reopening it never issues an authorization,
clears a lock or replays work. Final recovery acceptance/native release/finalization
remain mandatory before unresolved execution can be released.

## Replacing a retired verification policy

Before deploying a version that retires whole-host verification, inventory active,
pending and unresolved jobs read-only. Settle them under their pinned implementation
or use separately authorized read-only recovery before cutover. Do not rewrite
approvals, snapshots or results, cancel work without operator authority, or clear a
fence to make deployment pass. Historical tables may remain inert for reading.
Activate the replacement skill only after app support, publish a fresh immutable
package and renew its exact action grants. This changes no agent/SDK protocol.
