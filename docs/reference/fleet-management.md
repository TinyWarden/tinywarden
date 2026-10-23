# Fleet identity and management

A server's stable host ID owns its configuration and historical observations.
Display name, reported hostname, groups and tags do not establish identity and
must never cause two servers to merge. Replacing an agent credential retains that
host ID while advancing the agent generation.

## Storage boundaries

Fleet organization uses its own groups and memberships. These are distinct from
[permission groups](access-control.md): putting a server in an organizational group
never grants an account access. Server lifecycle is distinct from contact, current
skill evidence and notification eligibility.

Forward migrations preserve existing server IDs, credentials, per-server settings,
resource choices and access grants. Existing servers start Active at monitoring
epoch 1; observation retention defaults to 90 days. Assignment snapshots preserve the
epoch in which they were issued. A lifecycle boundary must not reinterpret an old
reading under a new monitoring epoch.

The [data lifecycle reference](data-lifecycle.md) defines retained evidence and
replay receipts. Schema definitions live in `server/db/migrations/` and the typed
Fleet tables in `server/db/fleet-types.ts`. Lifecycle changes require forward repair;
a schema downgrade must not remove an authority fence while agents are running.

## Monitoring control

Control-capable host agents poll `POST /api/v1/agent/monitoring-control` with
schema version 1, `capabilities: ["monitoring_control.v1"]` and `applied: null` or
`{epoch, mode}`. Epoch and generation are decimal strings; mode is `active` or
`paused`. The authenticated response binds host/agent/generation and epoch, with
issued/expiry instants, a five-minute lease and a 60-second poll interval.

The agent saves control before using it. A paused acknowledgement is sent only
when collectors have stopped. Heartbeat and platform maintenance continue while
collection is paused. A saved pause survives restart and expiry; an expired active
lease prevents collection. Once control has been negotiated, an unavailable
control endpoint cannot silently return the agent to legacy collection. An app
which has never supported control can retain the existing legacy wire behavior.

Assignments bind the current monitoring epoch without changing legacy wire hash
formats. An old-epoch result consumes its exact request/sequence as a compact
receipt and creates no reading, inventory, metric or reducer state. Previously
accepted exact retries still return their original receipt. Revoked or archived
credentials are rejected before replay. Manual requests and current projections
also respect lifecycle and epoch boundaries; resume needs fresh assignments/evidence.

## Organization and management authority

Admins manage servers. Users read only granted, non-archived servers. Fleet group
counts, tag choices and search use the same SQL visibility scope as the inventory.
Shared group descriptions and owner notes are Admin-only. Metadata commands use
expected server revisions; an inventory group never creates a permission grant.

`GET /api/v1/operator/fleet` provides bounded inventory pages with search, group,
tag, lifecycle, health, contact, maintenance, OS and version filters. Health uses
canonical stored-evidence projections in bounded server-side batches. It is not a
separate SQL interpretation of a skill's labels. Counts and pages share one snapshot;
requests have a bounded execution budget and no entire fleet is sent to the browser.

Fleet operation commands contain an operation UUID, action, explicit server IDs and
expected revisions. At most 100 targets are allowed. Each target has a short
transaction and a recorded outcome; exact retries resume pending targets and replay
completed ones. Changed intent conflicts. Archive/delete additionally require a
preview bound to the target revisions and retention policy revision. Pending deletion
means access is fenced and a purge job is queued, not that all stored data is erased.
The operation stores the confirmed retention policy revision independently of its
minimized target payload. Resume checks that original confirmation against the
current policy and rechecks each surviving target revision and current Admin
authority. Purging a completed target never changes the original fingerprint or
requires its deleted payload to be restored. A policy change requires a new
preview for the remaining targets.

Archive revokes current agent credentials and pending replacement authority. It
preserves retained history and configuration and cannot be undone by heartbeat.
A version 2 server setup request can target a specific archived revision for explicit
restore. Consuming that single-use ticket advances the credential generation and
monitoring epoch, returns the host to Active, and preserves its host ID and grants.
An unused/expired ticket leaves it archived. New setup intent may include group/tag
choices which are applied transactionally at enrollment; list responses never include
raw setup codes or tokens.

## Maintenance and notification boundaries

One-off maintenance windows preserve collection and actual health while suppressing
problem and recovery delivery attempts, including contact alerts. Scheduled start/end
is derived from server time, so suppression does not depend on a worker seeing the
window active. Pending messages from the preceding notification cycle are cancelled.
After the window, fresh evidence can produce one current problem notification; muted
transitions are not replayed. A healthy baseline does not invent an unseen recovery.
An already submitted transport delivery may complete and cannot be recalled.

Pause/archive ends monitoring continuity and notification eligibility. History and
notification writers take collection-root locks before the host and recheck lifecycle.
Dashboard operational counts exclude paused/archived servers and active maintenance;
independent management counts make excluded servers discoverable through Fleet.

## Retention policy and read authority

`data_retention_policy` is a singleton with days (default 90, range 1–3650), revision
and an irreversible `expired_before` watermark. The cutoff is the later of
`as_of - configured days` and that watermark. Reads use the central policy even
before physical cleanup. Reductions publish the old and new expiration boundary;
increases cannot expose rows which already expired. Cleanup publishes a pass
watermark before deletion and checks its policy revision under a shared lock in
every deleting transaction. A settings change causes an obsolete pass to retry.
The settings transaction does not acquire package/definition roots, preserving
lock order with cleanup. Ordinary policy reads do not hold a policy row lock. Observation commits acquire
a shared policy revision lock before package/host roots, so a reduction cannot
slip between the retained-state revision check and committing a new reducer state.
Legacy baseline commits and the shared History/notification sampling root take
the same policy lock before definition/host locks.
Their trim reducer also removes an execution older than the current cutoff from
a retained intermediate context before deriving the next context; the independent
legacy evidence-memory maximum remains unchanged.

Admin Settings → Data reads/previews/saves through `/api/v1/operator/data-retention`
and `/preview`. A reduction requires a confirmation digest bound to the revision
and proposed days. Saving is keyed by a request UUID and exact intent fingerprint;
reusing it for another change conflicts. Changes advance the access revision to
invalidate old browser read scopes. The signed-in session supplies safe days/cutoff
metadata to all permitted viewers for date navigation; Admin-only settings details
are not required by a user chart.

Age-bounded families include legacy/package observations and child metrics,
reducers, History events/facts, inventory snapshots, retired resource memberships,
manual results and notification message evidence. Identity, current settings,
selection intent, admission budgets and exact replay receipts do not expire merely
because monitoring detail does. Account/setup/repository-preview expiry remains
separate. Upload age/clock validation, legacy evidence-memory lifetime and the
90-day maximum window per chart request are independent safety bounds, not the
configured stored-row age. Metric context includes monitoring epoch so pause/resume
cannot connect old and new plotted evidence.

## Permanent deletion

The first transaction sets Deleting, advances monitoring/access authority, revokes
credentials and targeted tickets, retires manual/notification work, and records a
durable `fleet_purge_jobs` row. Normal host scope excludes Deleting; a generic
insert trigger fences every owned payload family against late writes. Agent
credentials and enrollment also recheck lifecycle. The purge job/operation receipt
uses an opaque host UUID without a root FK so it survives root removal.

The existing retention worker round-robins Fleet purge with age cleanup. Each purge
call deletes at most 100 owned rows and may skip a bounded number of empty stages.
Jobs persist a stage and row count in each short transaction and resume after a
restart. Transient lock/timeout failures remain retryable; permanent failures are
visible and Admin retry returns the same job to Pending at its first stage.
Revisiting bounded, idempotent stages removes earlier dependencies left behind by
an older failed writer. Worker output includes
pending/failed job counts and removed rows; failure is not reported as Complete.

`server/fleet/purge.ts` owns the dependency order and checks it against the real
foreign-key graph. Children precede roots: observations/metrics/receipts, settings
revisions, resource inventory/selection, History, notification evidence, setup
codes, organization/grants, accounting and agent identities. JSON mutation results
and Fleet operation intents are explicitly minimized; they cannot be discovered
by an FK traversal alone. Shared notification routes detach their scan cursor;
shared installations, packages, definitions, repositories, users and groups stay.
Current legacy policy heads and their final revisions disappear together under
commit-deferred integrity checks. Storage allocations are removed before verifying
that the per-agent budget is zero and deleting its budget row.

Keep only opaque deletion/operation IDs, actor, timestamp, intent fingerprint and
outcome after completion. No hostname, name, notes, tags, settings, credentials or
observation payload belongs in that minimal receipt. Unknown old credentials or
tickets never recreate a deleted identity. An in-flight notification completion
must tolerate a missing cursor and cannot recreate its outbox. Interrupted-claim
recovery, pending-event expiry and uncertainty acknowledgement resolve and lock the host before the
outbox. A deleting/missing host produces no new notification audit or cursor
update; unrelated hosts remain eligible for recovery/delivery. The insertion
fence resolves notification audit ownership through either event or attempt ID.
Pending expiry runs outside the shared route transaction, so it cannot invert
the host/route order used when purge detaches the shared scan cursor.

## Additional routes and UI ownership

| Route | Purpose |
| --- | --- |
| `GET /api/v1/operator/fleet-operations` | Paged operations for current Admins |
| `POST /api/v1/operator/fleet-operations/{id}/resume` | Resume the same saved pending intent under current authority |
| `POST /api/v1/operator/hosts/{id}/purge/retry` | Retry an existing failed purge job |
| `POST /api/v1/agent/reconnect-intent` | Enrollment-secret authenticated target/generation/purpose discovery before stopping the local managed service |

These POST routes use schema 1; resume/retry bodies have no mutation request UUID
because they refer to an existing durable identity. The Fleet command itself uses
its original UUID, revisions and intent for replay. Do not generate a new deletion
job or reconnect identity when retrying a lost response.

Fleet UI owns inventory/management; server details retain `/fleet/{id}` and current
Dashboard excludes nonactive/maintenance servers with links to their Fleet counts.
Main navigation is Dashboard → Fleet → Skills → History. Settings Data follows
Repositories, Agents, Users & groups and Sign-in. Shared DataTable utility columns
leave the first substantive value left-aligned; ActionMenu is a native top-layer
menu positioned before paint, and CursorPagination exposes only known cursors.

## Migration and recovery

Migration 031 defaults existing hosts to Active and epoch/revision 1 without
changing identity or configuration. Migration 032 adds opaque removal-confirmation
provenance and completes notification audit fencing. It preserves earlier
migrations. An older pending destructive receipt without confirmed provenance
fails closed: create a fresh preview/operation for its remaining servers instead
of inferring consent from a minimized payload. Deploy the new app/schema before upgrading
agents. Old clients keep strict existing wire shapes and cannot be claimed paused
until the new capability is negotiated. Once negotiated, collection fails closed
when control disappears or its active lease expires; heartbeat/update lanes remain.
No skill package, SDK descriptor or runtime pin changes for Fleet control.

Take the normal offline backup and verify the exact database target/ledger before
migration. There is no destructive down migration. Older app code does not know
the new ledger: recovery needs a compatible forward repair or an explicitly
reconciled offline database restore. Before workers or agent traffic resume from a
historical backup, reconcile later revocations, deletions, generations and outbound
work. A database backup contains its historical payload; deleting current rows
does not erase external backups. Follow the full recovery guide.

Group discovery is separately paged: `GET /api/v1/operator/fleet-groups` accepts a
name query, opaque cursor and up to 100 selected IDs. It returns at most 50 matches
plus scoped selected labels, so organization beyond the initial Fleet summary
cannot become unreachable. Sidebar, membership/setup choices and group management
use this same access-filtered search. A permission group is never treated as a
Fleet group or an automatic server grant.

### Operator request shapes

All operator POSTs check current Admin authority, same origin and the
`X-TinyWarden-Request: 1` header. IDs are UUIDs and revision counters are decimal
strings. Request bodies reject unknown fields. The main command envelope is:

```json
{
  "schema_version": 1,
  "request_id": "operation-uuid",
  "kind": "pause",
  "targets": [{"id": "host-uuid", "revision": "1"}],
  "values": {}
}
```

The example placeholders must be replaced with real UUIDs. Supported kinds are
metadata, membership, maintenance, pause, resume, archive and delete. Metadata
accepts one target with label/description/owner_notes/groups/tags. Membership uses
add_groups/remove_groups/add_tags/remove_tags without replacing other intent.
Maintenance uses action schedule/end and UTC starts_at/ends_at (null means now or
until manually ended). Archive/delete use a preview digest from `/preview`, which
accepts kind and the exact targets. Metadata and lifecycle/maintenance per-host
routes adapt these same domain contracts; they do not bypass revisions.

Inventory defaults to Active, name sorting and25 rows (100 maximum). Supported
sorts are name/status/contact; cursors bind the normalized filter/limit and last
key/ID. Filter families combine with AND, values within a family with OR. Group
and tag filters may repeat; health/contact may repeat. Empty/unsupported scalars,
malformed cursors and excessive limits are rejected. The query budget is bounded
below the client timeout. A changed filter must start with no cursor.

`POST /api/v1/operator/servers/setup` schema2 accepts request_id, mode new/replace/
restore, label, target_host_id, expected_revision, groups and tags. New mode has
null target/revision; targeted modes preserve existing groups/tags and accept empty
arrays. The returned setup_code is a one-time secret. Exact reissue cannot reveal
it; cancel the pending token and create a new request if the response was lost.
`GET /api/v1/operator/enrollment-tokens` contains no raw secret.

The new-server dialog displays a download-then-run command containing the setup
code. Only the exact `tw_setup_v1.` prefix plus unpadded base64url characters, at
most 4096 bytes, can enter the generated shell line. A successful complete download
is required before execution; shell builtin `printf` supplies the code through
standard input to `sudo bash install.sh --setup-code-stdin`. The installer passes
that stream to the signature-verified agent. No secret goes in the agent's process
arguments or a URL. Treat the whole command as a credential, including clipboard
and shell history; ticket expiry and single-use semantics are unchanged.

The separate Setup code section/Copy action remains. No-input invocation retains
the hidden terminal prompt and protected `--setup-code-file` input is unchanged.
Agent 0.0.16 adds explicit bounded stdin input only for fresh install, rejecting
empty/oversized/multiline/read-failed input without terminal fallback. Stdin cannot
be combined with a setup file, adoption or another administrative command.
Replacement and restore dialogs retain the managed `reconnect` command. The
installer supports Debian 13 amd64 and checks platform compatibility before
suggesting missing packages. Python 3.13 remains the runtime contract; the Debian
package recommendation is `python3`. Prerequisite advice names only packages for
failed checks and never installs them automatically.

Retention save uses request_id, expected_revision, days and nullable confirmation;
its `/preview` POST accepts days. Group create/save/delete uses request_id, action,
id, expected_revision, name and description; create derives its ID from request_id.
Conflicts return409, denied roles403 and unavailable/hidden targets404. An uncertain
transport result must retry the same body/UUID. Completed targets do not run twice;
failed/conflicting targets need a fresh selection/review rather than blind replay.

Activity lists use25-row cursor pages with an optional `pending=1` filter. Setup
code status is not a secret; raw secrets never appear in list responses. Operation
details and pending/deletion recovery are available to any current Admin so an
operator who leaves cannot hide unfinished cleanup. Original request replay remains
bound to the creating actor/fingerprint; the explicit resume endpoint reauthorizes
each surviving pending target and audits the acting Admin without rewriting the
original actor. Failed purge jobs stay discoverable through the unfinished filter.
