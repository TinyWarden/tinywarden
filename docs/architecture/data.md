# Data, application boundaries and migrations

This contract owns shared persistence, application boundaries and explicit
migrations. [Access](../security/access.md) and [agent protocol](agent-protocol.md)
own authority and wire semantics. Additive definitions/results are described in
[check definitions](check-definitions.md), [disk observations](disk-observations.md)
and [baseline delivery](baseline-protocol.md). [Data lifecycle](data-lifecycle.md)
owns expiration, compact retry receipts, cleanup and recovery.

The schema descriptions below preserve original shared representation.
Later migrations extend it without rewriting old reading or credential identities.

## Boundary ownership

Create these capabilities as their implementation batches arrive, without empty
placeholders: operator access owns password/session lifecycle; fleet owns token
issuance, enrollment, credential replacement/revocation, heartbeat and inventory reads.
Thin Next routes parse transport and call a named root use case. One server-only
database adapter owns the pool, typed records and migrations. Domain code accepts an
injected clock and transaction-scoped collaborators, not global request state.

Roots: InitOperator, ResetOperatorPassword, LoginOperator, LogoutOperator,
IssueEnrollmentToken, RevokeEnrollmentToken, EnrollAgent, RevokeAgent and
AcceptHeartbeat. Replacement is the bound-token branch of EnrollAgent. Fleet roots
use the access capability's intentional transaction-aware authorization guard;
they do not reach into access internals. Subordinate record/audit writes never commit
independently. InventoryRead owns one authenticated, consumer-shaped read snapshot.

## Logical schema and constraints

Use dedicated schema `tinywarden`, snake_case names, UUID identity columns and
timestamptz(3) instants. Fields are NOT NULL unless explicitly nullable. Secrets use
bytea digests with octet_length=32 checks. Sequence
and generation columns use bigint with safe-integer checks; parse driver output
explicitly before exposing JSON numbers. Use millisecond precision throughout;
session/expiry calculations use UTC elapsed durations. No JSON blobs for authority,
foreign keys, lifecycle or searchable fields.

| Table | Required fields and integrity |
| --- | --- |
| operators | id PK; singleton boolean UNIQUE CHECK true; login UNIQUE CHECK `admin`; password algorithm/parameters/salt/hash; auth_version positive; created_at, password_changed_at. Exactly one row maximum; no seed password. |
| login_throttle | singleton PK CHECK true; window_started_at, attempts CHECK 0..5. Atomic fixed-window attempt reservation; no IP/name/body fields. |
| operator_sessions | id PK, operator_id FK, secret_digest UNIQUE, auth_version, issued_at, last_seen_at, expires_at; issued ≤ last_seen < expires; index operator_id/issued_at. At most five per operator through its lock. |
| hosts | id PK, label, reported_hostname, os_id, os_version, architecture, enrolled_agent_version, created_at; bounded text matching wire validation; label 1..100 Unicode scalars, no control characters. Names are descriptive and need not be unique. |
| agents | id PK, host_id UNIQUE FK; current_generation positive, enrolled_at, revoked_at nullable; heartbeat_interval_seconds and stale_after_seconds snapshot constraints. One agent per host in shared. |
| agent_credentials | id PK, agent_id FK, generation, secret_digest UNIQUE, created_at, revoked_at nullable; last_sequence default 0, nullable last_fingerprint/accepted_at/sent_at/agent_version; separate nullable last_contact_at; UNIQUE(agent_id,generation), partial UNIQUE(agent_id) WHERE revoked_at IS NULL; last_sequence=0 iff heartbeat fields are all null; last_contact_at is independent. |
| enrollment_tokens | id PK, secret_digest UNIQUE, issued_by FK, issuance_request_id, issuance_fingerprint, label; target_agent_id and expected_generation both null (new host) or both present (replacement); issued_at, expires_at, revoked_at nullable; consumed_at/request_id/fingerprint/credential_id all null or all present; UNIQUE(issued_by,issuance_request_id), UNIQUE(consumed_request_id), UNIQUE(consumed_credential_id). Target/consumed IDs have FKs. |
| audit_events | id PK, occurred_at, action, actor_kind; nullable operator_id/agent_id identify the actor, with FKs and actor-kind consistency check (system has neither); nullable target_operator_id/target_agent_id, host_id/token_id identify targets, with FKs; correlation_id; validated action-specific change fields. No arbitrary payload/secret columns. Application roots append events; database ownership does not enforce immutable audit. |

Referenced records use ON DELETE RESTRICT. No cascade fleet deletion. Sessions may
be deleted without erasing audit because audit does not reference session rows.
Index referencing FK columns not already covered by a leftmost matching index, plus
hosts(created_at,id), audit_events(occurred_at,id) and token issued_by/issued_at.
Only add additional indexes for an actual query plan. Constraints are the final
backstop; application validation provides safe error codes first. A partial unique
index allows zero active credentials for a revoked agent, at most one otherwise;
the root transaction additionally ensures active agents have exactly one matching
current generation, and that token-consumption bindings are consistent.
Cadence constraints match the configuration contract: interval 10..300 and grace
between three intervals and 3600. Generation is 1..9007199254740991; sequence is
0..9007199254740991. Replacement refuses generation exhaustion with 409
`generation_exhausted`. Token expiry is issued_at+15 minutes; consumption cannot
precede issue. Clock-before-creation authority fails closed. Derive last contact from
the greater non-null last_contact_at/accepted_at on the single active current-generation
credential; do not maintain another timestamp on the agent. Successful current-agent
operations update separate contact evidence under existing authority locks and in
their successful transaction; heartbeat accepted_at retains its receipt meaning. Replacement therefore produces unknown contact from its empty new
credential snapshot without losing historical evidence on the revoked credential.

## Audit actor and target representation

`operator_id` and `agent_id` identify only the actor. Preserve the existing SQL
actor-kind check: system has neither, operator has only operator_id, and agent has
only agent_id. `target_operator_id` and `target_agent_id` identify affected records
independently of the actor. `host_id` and `token_id` remain typed target/context links.
Revocation records its target agent explicitly; do not infer it from the host or
put an operator's target in the agent actor column.

The transactional audit helper owns the action/actor/target allowlist below. Require
action-specific inputs and validate their field combinations before insertion;
reject unsupported actions or extraneous actor/target/change fields. All events
also require id, occurred_at and correlation_id. A dash means SQL NULL.

| Action | actor_kind / actor ID | target_operator_id | target_agent_id | host_id | token_id | Change fields |
| --- | --- | --- | --- | --- | --- | --- |
| operator.initialized, operator.password_reset | system / neither | affected operator | — | — | — | — |
| operator.login, operator.logout | operator / operator_id | — | — | — | — | — |
| enrollment.issued | operator / operator_id | — | — | — | issued token | — |
| enrollment.revoked | operator / operator_id | — | — | — | revoked token | revoked=true |
| agent.enrolled | agent / agent_id | — | same as agent_id | agent's host | consumed token | — |
| agent.credential_replaced | agent / agent_id | — | same as agent_id | agent's host | consumed token | from_generation, to_generation |
| agent.revoked | operator / operator_id | — | revoked agent | agent's host | — | revoked=true |

Replacement generations are positive safe integers with to_generation exactly one
greater than from_generation. Token actions target the token; its immutable binding
provides replacement-agent context when applicable. Redemption records the bound
agent as actor; token_id links to the authorizing operator. This preserves the access
contract's authority distinction. The root supplies the locked/validated host and
agent IDs; the helper remains transaction-neutral and adds no new lock order.
Replay/no-op paths create no additional event. No audit-reading API is introduced.

### Audit target migration and compatibility

Implement a new immutable migration `002_audit_target_agent.ts`: add nullable UUID
`audit_events.target_agent_id` referencing `agents(id)` ON DELETE RESTRICT and a
non-unique index `audit_events_target_agent` on it. Keep `001_initial.ts`, existing
actor fields/checks and all prior audit values unchanged. No backfill or host-based
guessing is required. The nullable expansion permits prior insert shapes; the new
application helper requires complete target metadata for new agent lifecycle events.
Do not claim SQL alone enforces every action-specific requirement.

Historical agent.enrolled/agent.credential_replaced rows with a NULL target retain
their original self-action meaning: their non-null agent actor is also their target.
When querying targets across revisions, use target_agent_id first and fall back to
agent_id only for those two actions with actor_kind=agent. Never apply that fallback
to operator revocation or a general action; preserve NULL as unknown otherwise.
New events always store the explicit target. Existing rows and counts are preserved,
and the new reference follows shared no-hard-delete retention contract.

Apply 002 through the existing explicit, owner-checked migrator before running code
that writes the column. Clean install runs 001 then 002; an existing 001 database
upgrades without reset. Keep transactional migration execution and bound lock/statement
waits; failure leaves the prior schema and migration ledger intact. Adding a column
without a default leaves existing rows NULL under
[PostgreSQL's column-addition rules](https://www.postgresql.org/docs/18/ddl-alter.html#DDL-ALTER-ADDING-A-COLUMN).
Foreign keys preserve references, and their referencing-column indexes must be added
explicitly under [PostgreSQL's constraint rules](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-FK).

Rehearse populated 001→002 upgrade, clean install, repeat/concurrent migrators and
failure rollback on the reserved test database. Compare original audit columns and
related row counts before/after; verify legacy and new target interpretation, dangling
target rejection, deletion restriction and preserved actor-kind rejection. Include
legacy insert shapes after expansion. Update migration-ledger assertions to the exact
ordered migration names. Do not erase upgrade evidence by testing only a reset schema.

Production upgrade retains the reviewed backup/quiescence/exact-revision gate.
Code rollback keeps 002 installed and needs evidence that the selected earlier
revision tolerates the expanded schema and required workflows. Do not implement a down migration that drops
target history; refuse downgrade and use reviewed forward repair or an explicitly
authorized restore. A NULL-compatible column alone does not prove release recovery.

## Transaction and concurrency contract

Use PostgreSQL READ COMMITTED with explicit row locks. Authorization lookups may
locate immutable IDs first, but authority/preconditions must be rechecked after locks.
Consistent order for any rows touched: operator → session → enrollment token → host →
agent → credentials sorted by ID. Skip absent categories; do not acquire an earlier
category later. The throttle reservation is a separate short transaction before
password hashing. New rows have no prior row lock; use unique constraints for races.

Token issue takes operator/session locks, then checks existing issuance_request_id.
For replacement also lock target host/agent and snapshot current_generation. Multiple
issued replacement tokens may target the same generation; only one can be redeemed.
Do not update other token rows while holding a later agent lock. Revocation similarly
need not rewrite tokens: redemption rechecks agent revocation/generation. Consumed
token replay takes token/host/agent/credential locks and rechecks all authority.

Capture effective now after acquiring locks and use it throughout the root mutation.
Token expiry waiting on a lock therefore cannot authorize a late consumption. Revoking
an agent and accepting its heartbeat serialize on the same agent lock; token redemption
and credential replacement do too. Commit state and audit together. Do not perform
network calls or password hashing while a transaction holds domain locks.

Statement timeout 5 seconds, lock timeout 2 seconds, transaction timeout 10 seconds.
Cancellation/timeout rolls back. On deadlock/serialization failure, roll back and
return retryable 503; clients retry only using their saved idempotency identity.
Unknown commit outcome must not trigger an unkeyed second write. Return success only
after commit; log safe error codes without driver messages or SQL parameters.

## Operator API and reads

These routes use access.md's cookie, Origin and custom-header checks. Every JSON body
includes schema_version=1. No Server Action may bypass the root use cases.
Access, token issue/revoke, enrollment, heartbeat, inventory, revocation and
replacement use both
server and agent. Until that batch, non-null token target_agent_id returns 409
`capability_unavailable`; do not create a token that cannot be safely redeemed.

| Route | Request / result |
| --- | --- |
| POST /api/v1/operator/login | login, password → 200 `{schema_version:1,authenticated:true}` plus session cookie; 401 generic failure, 429 throttle |
| POST /api/v1/operator/logout | No other fields → 204 and cookie removal |
| GET /api/v1/operator/session | 200 `{schema_version:1,login:"admin",expires_at}` for valid session; otherwise 401 |
| POST /api/v1/operator/enrollment-tokens | request_id, label, target_agent_id (UUID or null) → 201 `{schema_version:1,token_id,token,expires_at}` once. Replacement label is required to equal the current host label. Same issuance ID/fingerprint → 409 `token_already_issued` with token_id but no secret; differing input → 409 `issuance_conflict`. |
| POST /api/v1/operator/enrollment-tokens/{id}/revoke | No other fields → 204; revoke once with audit; absent ID 404; repeated revoke 204. Revoking a consumed token disables its enrollment replay, not its agent credential. |
| POST /api/v1/operator/agents/{id}/revoke | No other fields → 204; repeat is a no-op; absent ID 404 |
| GET /api/v1/operator/hosts | limit default 25, 1..50; optional cursor tuple created_at/id → page and next_cursor |
| GET /api/v1/operator/hosts/{id} | Same host projection as list, or 404; no secrets/tokens/hashes |

Only the authenticated `token_already_issued` error extends the shared error envelope
with `error.token_id`; every other error carries code alone. A global consumed_request_id
collision across tokens returns `enrollment_conflict`, without exposing the other token.

Issuance fingerprint is SHA-256 of UTF-8 JSON.stringify
`[1,request_id,label,target_agent_id]`. Authenticate before revealing a conflict or
record ID. Limit unexpired unused, unrevoked tokens to 20 per installation under the operator
lock; return 409 `token_limit` if exceeded. Replacement tokens preserve host label;
no host-edit workflow is introduced. Token issuance itself creates no host.

Inventory response fields: schema_version, as_of, hosts (or host), next_cursor on list.
Host projection: host_id, agent_id, label, reported_hostname, os_id, os_version,
architecture, agent_version (latest heartbeat version or enrolled_agent_version),
contact_state, last_contact_at, stale_at, heartbeat_interval_seconds,
stale_after_seconds, health_state=`unknown`, created_at. Nullable last_contact_at
and stale_at cover no accepted agent communication; stale_at otherwise equals last_contact+grace.
Under the short account/session transaction, recheck authority and refresh session
activity, then use one fleet projection SQL statement/snapshot per inventory response.
Capture its reference time once. Order by created_at DESC,id DESC; validate cursor
tuple and apply strict keyset bounds.
Encode cursor as unpadded base64url of UTF-8 JSON `[created_at,id]`, maximum 256
characters. Validate both values before parameterizing the query; reject unknown
query keys. Fetch limit+1 rows; next_cursor is the last returned tuple only if another
row exists, otherwise null. A detail response has host (one object) and no next_cursor.
Response body cap 128 KiB, no total-count query/fan-out. Database errors return 503,
not an empty result. All authority-bearing responses are uncached.

## Tooling

Select **Kysely 0.29.6 + pg 8.23.0**, with **@types/pg 8.23.1** for development and
Kysely's built-in Migrator/FileMigrationProvider. Registry metadata verified
2026-09-28: Kysely requires Node ≥22, pg ≥16; all three declare MIT. Existing Node24 /
strict TypeScript5.9 satisfies their stated requirements; runtime compatibility
is exercised by the integration tests.

[Kysely's PostgreSQL dialect](https://kysely.dev/docs/getting-started) provides typed
SQL over pg and requires a database type definition; runtime validation and driver
date/bigint mappings remain our responsibility.
[Its migration API](https://kysely.dev/docs/migrations) provides ordered migration
execution with a database lock. Keep transaction-enabled migration defaults. Use a
small explicit server-only migration entry point, not an additional migration CLI,
ORM, live schema introspection, or startup auto-migration. Raw pg plus a separate
migrator would leave query-schema typing and more transaction plumbing to maintain.

Keep a single bounded server pool (max 5, connection wait 2 seconds, idle 30 seconds),
close it on orderly shutdown and use Kysely's transaction-scoped handle throughout
each root. Do not mix pool queries into an in-flight transaction. Native PostgreSQL
18 is the implementation target. No pool, DB lookup or private config requirement
during static build; validate server configuration before accepting product traffic.

Use ordered immutable migrations in the owning web database adapter, with frozen
historical table shapes (never importing today's application models). Maintain one
current Database type and verify it against the dedicated test database on the
existing PostgreSQL instance.
Test clean install, repeat/no-op, concurrent migrators, a failed migration rollback
and constraints. Never run destructive down migrations against production; a code
rollback requires schema compatibility, otherwise forward repair or an authorized
restore. No data-bearing rollback is proven merely by a successful empty down/up.

## PostgreSQL ownership and test targets

Use the existing PostgreSQL instance and one login, `tinywarden`, for database
creation, explicit migrations, local operator commands, application queries and tests.
The required attributes are LOGIN, CREATEDB, NOSUPERUSER, NOCREATEROLE,
NOREPLICATION and NOBYPASSRLS, without privileged role memberships. This role owns
the reserved TinyWarden databases, their `tinywarden` schema and application objects.
CREATEDB allows creating databases; it does not grant ownership of unrelated ones.
This configuration uses one login for migrations and serving requests.
Do not introduce extra PostgreSQL roles, administrator connections or per-test clusters.

Use one `DATABASE_URL` for the selected process target. Migrations remain an explicit
local command with a required expected database name, never an application startup
action or HTTP capability. Before migration, verify the connected database and
current/session role against that target and verify the database/schema ownership;
fail on mismatch before DDL. Grant no privileges to retired role names. Restrict
PUBLIC access only within the reserved database/schema and its objects, under their
owner; leave unrelated resources alone. See [configuration](../deploy/configuration.md)
for the connection and permission setup.

The consequence of sharing the owner login is explicit: the serving process has
schema-changing powers and can modify audit history if its database access is
compromised. Audit remains append-only through application use cases and commits
atomically with state, but is not protected from the database owner. Revoking ordinary
privileges from the owner cannot establish an independent security boundary because
the owner can restore them. Do not claim DDL denial, tamper-proof audit or database
isolation between resources owned by this same login. These limits follow
[PostgreSQL ownership rules](https://www.postgresql.org/docs/18/ddl-priv.html).
Reconsider privilege separation with the later development/production split; it is
not an additional shared prerequisite under the selected single-user contract.

For shared use only the explicitly reserved synthetic database `tinywarden_test_p1b`,
owned by `tinywarden`, on the existing instance. The test harness requires a separate
`TW_TEST_DATABASE_URL` and must never infer its target from the application's live
environment. Before any fixture reset, verify the exact connected database name,
session/current role and database owner. Refuse other names, roles or owners; serialize
fixture resets and limit them to this database's application/test objects. Concurrent
migration tests mean two migration processes using the same login. They do not need
two roles. Keep PostgreSQL configuration, service lifecycle and other databases outside
the test harness. Synthetic data separation here is an operational guard, not a
database privilege boundary. Production provisioning/migration retains its reviewed
backup, exact-target and authorization requirements.

Primary references for database guarantees:
[PostgreSQL isolation](https://www.postgresql.org/docs/18/transaction-iso.html),
[constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) and
[node-postgres transactions](https://node-postgres.com/features/transactions).

## baseline additive integration

[Baseline integration v1](baseline-protocol.md) owns migrations 006/007 and the
eight additive baseline tables: definitions/revisions, policies/revisions,
delivered assignments, mutation receipts, runs and recovery latches. Migrations
001–005 stay immutable. Typed identity/foreign keys/sequence/source provenance
surround bounded validated recipe/observation JSON. Immutable historical meaning
and first receipt never depend on current settings. Baseline definition locks in
sorted key order precede host/agent/credential/policy locks; do not acquire a disk
definition lock after the host. Exact retry receipts, change and typed audit commit
together. Missing retained identity commits a generation recovery latch before
returning conflict. All seven migrations were exercised only on the reserved test
database. Apply the full current migration ledger before running current code.
