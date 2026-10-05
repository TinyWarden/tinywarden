# Versioned check definitions and assignments

[Access](../security/access.md) owns authentication; [data](data.md) owns shared
database conventions; [disk observations](disk-observations.md) owns evidence.
This contract defines disk revision/snapshot identity and the legacy full-override
representation. [Field overrides](field-overrides.md) supersedes that representation
for new schema2 host edits. [Skill enablement](skill-enablement.md) adds global Off;
the original always-enabled assignment remains relevant to legacy compatibility.

## Disk baseline and legacy policy

The original disk contract defines one baseline definition, stable key `disk-local`, kind
`disk_usage`, requiring capability `disk_usage.v1`. It covers every local
filesystem according to the versioned collector policy. Its initial defaults are
warning 85%, critical 95%, interval 300 seconds. One authenticated administrator
may edit the global defaults, set a complete host override, or return a host to
inheritance. Groups, per-mount exceptions, arbitrary recipes, deleting the baseline and privileged host actions are outside this contract.
Global disabling is defined in [skill enablement](skill-enablement.md). Existing and future enrolled
hosts inherit the baseline automatically; an unsupported host remains explicit.

`server/skills` owns definition/policy validation, resolution, revision delivery,
operator mutation roots and later result interpretation. Thin routes and UI call
that boundary. Fleet exposes its intentional transaction-scoped agent-authority
guard for reuse by heartbeat and checks; it resolves the host from the credential
and rechecks generation/revocation under shared locks. Checks never infer authority
from a caller's host ID. Access continues to own operator/session authorization
and action-specific audit validation. The agent's scheduler owns local scheduling
and cache persistence; it does not derive authoritative health.

Roots: `ReadDiskDefinition`, `UpdateDiskDefinition`, `ReadHostDiskPolicy`,
`SetHostDiskPolicy`, `FetchCheckAssignments`, `AcceptDiskRun` and
`ReadDiskHealth`. No worker, new PostgreSQL role or dependency is
required by this contract.

## Values, provenance and history

Editable values are a complete tuple: integer `warning_percent` and
`critical_percent` with `1 <= warning < critical <= 100`, and integer
`interval_seconds` from 60 through 3600. disk fixes selector/evaluator versions to 1,
collection timeout to 10 seconds, and observation grace to three intervals.
These fixed semantics cannot be edited as JSON recipes. Changing the meaning of
the collector or evaluator requires a compatible capability/version change.

| State | Meaning | Effect of a global default edit |
| --- | --- | --- |
| Inherited policy | Resolve the current definition revision on delivery | New effective assignment on the next successful fetch |
| Host override | All three values are explicitly chosen; record the definition revision visible when saved | Values and effective assignment remain unchanged |
| Delivered snapshot | Immutable resolved values, versions, provenance and agent generation | Never rewritten |
| Historical observation | References the delivered snapshot used to collect it | Retains that snapshot's interpretation |

An override equal to the current default is still an override. Switching back to
inheritance is an explicit mutation. Legacy schema1 edits use complete overrides. A true
no-op preserves revisions and creates no audit event; provenance changes are not
no-ops. Saving an already-overridden identical tuple keeps its existing pinned
definition revision, even if the global head has moved. Once committed, revisions,
snapshots and accepted observations have no
update/delete application operation. [Retention](data-lifecycle.md) preserves their references when removing expired detail.

## Database contract

Add migration `003_check_definitions`; do not edit 001/002. Use schema
`tinywarden`, shared UUID/timestamp/bigint conventions and ON DELETE RESTRICT.
All revision counters fit `0..9007199254740991`; exhaustion fails with 409
`revision_exhausted`, never wraps. Definition and delivered revisions start at 1;
an untouched host policy is version 0, mode `inherit`.

| Table | Required structure and constraints |
| --- | --- |
| check_definitions | definition_key PK, disk CHECK key=`disk-local`, kind=`disk_usage`, current_revision positive FK to matching definition revision |
| check_definition_revisions | PK(definition_key,revision); validated tuple, selector_version=1, evaluator_version=1, created_at; FK definition_key |
| host_check_policies | PK(host_id,definition_key), FKs host/definition, current_policy_version, last_delivery_revision default 0; FK to matching policy revision |
| host_check_policy_revisions | PK(host_id,definition_key,version), FK policy head; mode inherit/override, created_at; inherit has NULL override fields and NULL pinned_definition_revision; override has the complete validated tuple and a matching definition-revision FK |
| check_assignment_snapshots | id UUID PK, host_id/definition_key FK policy head, agent_id and generation FK agent_credentials(agent_id,generation), revision positive, definition_revision and policy_version matching composite FKs, mode, applicability, complete resolved tuple, selector/evaluator versions, created_at, payload_digest bytea length 32; UNIQUE(host_id,definition_key,revision) |
| check_mutation_receipts | PK(operator_id,request_id), operator FK, root/action and target definition/optional host, request_fingerprint bytea length 32, changed boolean, resulting definition/policy revision FKs, completed_at |

Use initially deferred composite FKs for head/revision creation cycles; no
transaction may commit a missing referenced revision. Snapshot host/agent
consistency is enforced by a composite FK to a matching unique agents(host_id,id)
key, in addition to its credential-generation FK. Add indexes for uncovered FK
prefixes, immutable host history and snapshot source lookup. Do not use JSON blobs
for policy, authority, relationships or revisions. Resolved snapshot columns are
deliberate historical data; the resolver and acceptance tests prove their agreement
with immutable source revisions. Database ownership still allows manual tampering;
Shared single-user audit limitation is unchanged.

Seed definition revision 1 and its head with the selected defaults, plus one
`check.definition_initialized` system audit event in the migration transaction.
Host policy/version-0 rows are created lazily, under the host lock, on first fetch
or mutation; a read can project implicit inheritance without writes. Materializing
that implicit state is not an operator edit and creates no user audit event.
Do not rewrite existing host, heartbeat or credential records. Revoke PUBLIC access
to all new tables. Migration failure rolls back; downward migration refuses
historical-data deletion. shared code can ignore the additive tables, but cannot expose
Disk controls or claim disk delivery after a rollback.

## Transactions, retries and audit

Use the existing bounded transaction timeouts. Operator roots acquire operator/
session locks first. Thereafter, disk locks the definition head before host, agent,
credential and policy rows, preserving shared relative host → agent → credential
order. Global edits take the definition head FOR UPDATE; fetch and host edits use
FOR SHARE. A preliminary credential lookup only locates the records; validate
the actual credential again after locking. shared paths never acquire the definition
head after holding host/agent locks. Keep transactions short and free of I/O.
This uses PostgreSQL's documented [row-lock conflicts](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS).

Capture effective UTC time and recheck session/agent authority after all waits,
including idempotent replay and no-op outcomes. Clock-before-record-creation fails
closed. Global update atomically appends revision N+1, moves the head, appends
audit and saves the receipt. Host edit similarly appends policy V+1. Use explicit
optimistic preconditions; a stale editor gets 409 `revision_conflict` without edits.
No global edit rewrites all host rows or delivered snapshots.

Every operator POST has a caller-generated UUID `request_id`. The receipt key is
operator+request_id across both roots. Its SHA-256 fingerprint is UTF-8 JSON of
the ordered array `[1,root,definition_key,host_id_or_null,expected_revision_or_null,
expected_policy_version_or_null,expected_default_revision_or_null,mode_or_null,
warning_or_null,critical_or_null,interval_or_null]`, after strict validation.
An authorized exact replay returns the original outcome, even if newer edits now
exist; it cannot move the head again. Changed input with the same ID gives 409
`request_conflict`. Check receipts before optimistic preconditions. Record a
successful no-op receipt too. Retain receipts until a dedicated mutation-receipt retention policy is adopted.

Extend the audit allowlist and typed schema for `check.definition_initialized`,
`check.definition_updated`, and `check.policy_updated`. All target the definition;
policy edits also target host_id. Initialization has actor system and to-definition
revision 1; updates have the authenticated operator actor and exact from/to
definition or policy revisions. Use typed nullable FKs for these fields, with
composite host/definition scope; older shared audit rows remain NULL. Revision references
provide before/after values. No raw request/configuration payloads in audit or logs.
Fetch is an authorized delivery read that may materialize a snapshot, not an
operator change; unchanged polls do not append audit, receipts or snapshots.

## Operator HTTP and editing

Use shared cookie, Origin, custom-header, body/version validation, no-store and error
rules. Bodies and these responses stay within 16 KiB. One selected definition
means no generic list/editor framework.

| Route | Request and result |
| --- | --- |
| GET /api/v1/operator/check-definitions/disk-local | No query; current revision, tuple and fixed capability/selector/evaluator metadata |
| POST same path | schema_version=1, request_id, expected_revision, warning_percent, critical_percent, interval_seconds; 200 with changed, duplicate and resulting revision |
| GET /api/v1/operator/hosts/{id}/checks/disk-local | No query; current_default_revision/values, policy_version/mode, override tuple or null, effective values/applicability and latest delivered revision or null |
| POST same host path | schema_version=1, request_id, expected_policy_version, expected_default_revision, mode; override requires all three values, inherit forbids them; 200 with changed, duplicate and resulting policy_version |

Unknown host gives 404 after operator authorization; a revoked host rejects new
edits with 409 `agent_unavailable`. Both host preconditions are required, including
on return to inheritance, so an intervening default edit cannot surprise the user.
Mutation replay returns its historical receipt rather than pretending it is a fresh
current read. Refresh the current saved baseline separately after success.
The [UI contract](../ui/contract.md#skills-and-history) owns forms and conflicts.

## Agent delivery and cache

POST `/api/v1/agent/assignments` uses only the current Bearer agent credential.
Request: schema_version=1, agent_version, capabilities (unique strings, at most 8,
each 1..64 ASCII letters/digits/dot/underscore/hyphen), and `known_assignment`
(null or `{id,revision,digest}`). Digest is 64 lowercase hexadecimal characters;
IDs and positive revision use shared bounds. No caller host_id or parameters. Use
Shared TLS, timeout, media, 16 KiB and no-store rules. This fetch never renews heartbeat
contact. enrollment and heartbeat responses retain their existing schemas.

Initial applicability requires stored os_id=debian, major os_version=13, architecture
amd64 and capability `disk_usage.v1`. A newer compatible version string alone is
not proof of capability. Return normal delivery with applicability
`ready`, `unsupported_os`, `unsupported_architecture` or `missing_capability`;
unsupported cases have an empty checks array and unknown health, not a fatal login
error. Metadata changes require their own future inventory contract.

Under the locks above, resolve the source definition (current head for inherit,
pinned revision for override), policy version, agent generation and applicability.
Compare this source tuple to the last snapshot for the host/definition. If equal,
reuse it. Otherwise increment last_delivery_revision, append one immutable snapshot
and return it. Two concurrent fetches resolve to one snapshot/revision. A global
numeric edit therefore advances inherited delivery lazily; overrides reuse their
snapshot. A generation change always produces a new snapshot even if values match.

200 response always includes schema_version, host_id, agent_id, generation,
`assignment_id`, `revision`, `digest`, `not_modified`, and `poll_interval_seconds=60`.
When all three known fields exactly match this current snapshot, not_modified=true
and `assignment` is absent. A verified older known snapshot gets the current full
payload. Otherwise not_modified=false and assignment includes
definition_key, definition_revision, policy_version, mode, applicability, effective
and checks. The effective object always contains capability, selector_version,
evaluator_version, warning_percent, critical_percent, interval_seconds,
timeout_seconds=10 and stale_after_seconds=3*interval, including unsupported cases
so the client can verify the digest. The ready checks array contains exactly
`{kind:"disk_usage"}`; unsupported checks is empty. Only this fixed baseline exists,
so effective describes that check. No shell text or path input.

Snapshot digest is SHA-256 over UTF-8 JSON of
`[1,host_id,agent_id,generation,"disk-local",revision,definition_revision,
policy_version,mode,applicability,"disk_usage.v1",1,1,warning,critical,interval,10,
3*interval]`. Persist before responding. This identifies content and is not an
authentication signature. Before creating a candidate snapshot, compare an
authenticated current-generation client's known revision/ID/digest to the
**persisted** snapshot at that revision. A missing known revision gives 409
`assignment_revision_regressed`; a known revision from the wrong generation is
also a regression. Equal-revision ID/digest divergence gives 409
`assignment_recovery_required`. This prevents a restored server from
reusing a lost revision before noticing the regression. A client-known revision
higher than server state cannot silently downgrade after a database restore.

Migration `005_disk_recovery_latches` adds one sticky marker per agent credential
generation with host scope, first reason and time. The server commits the marker
before returning either 409. The same marker is set before 409 `assignment_unknown`
when a current-generation run names a snapshot absent from this database; an
existing wrong-host or wrong-generation snapshot is rejected without treating it
as a lost local snapshot. While marked, fetches including known=null keep returning
409 `assignment_recovery_required`, and current disk health is unknown for reason
`assignment_recovery_required`. Heartbeat, policy edits, valid retained-snapshot
run retries and assignment polls never clear the marker. Historical rows remain
available. Only explicit credential replacement moves authority to a new
generation; that generation must receive a new assignment and fresh observation.

Persist the complete validated snapshot atomically in a separate mode-0600,
bounded `assignments.json` beneath the already locked state directory; keep the
Shared identity state's strict schema unchanged. Scope cache by origin/host/agent/
generation and reset its use on scope change. Omitted payload requires the exact
saved ID/revision/digest; no cache means send known_assignment=null. Ignore older
responses; equal revision with changed identity/content is a protocol fault.
Never publish a partially saved assignment. This file is protected host metadata,
not a place to copy credentials. Older binaries ignore it but cannot collect disk.
On any terminal assignment fault, durably clear only the cache's validation time
before the scheduler continues; keep its ID/revision/digest for later rollback
detection. A restart during a temporary fetch failure therefore cannot resume
offline collection under an old 24-hour lease. A successful validated delivery
or exact not_modified response can renew the lease only when no server latch
blocks that generation.

The scheduler is one owner of credential/cache files, with independently due
heartbeat and assignment lanes. Keep heartbeat priority and one bounded attempt
per due lane; an assignment retry must not enter shared infinite retry loop and
starve heartbeat. Preserve shared retry bounds/Retry-After for each lane. Assignment
401 stops all authenticated work; temporary failures retry; 404/unsupported response
disables check delivery visibly while heartbeat continues, supporting agent/server
upgrade skew. On successful replacement, old-generation assignments and pending
runs are unusable; preserve history server-side and account for abandoned local
runs without logging payloads. Revocation still stops all authenticated work.
