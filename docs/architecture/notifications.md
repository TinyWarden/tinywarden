# Email notifications

Email alerts cover warning/critical checks, offline hosts and recoveries for one
configured recipient, once per observed state change. Native scheduling is optional.
[Stored assessment versions](fleet-dashboard.md#per-run-assessment-compatibility)
retain each run's interpretation. A fresh limited package/reboot pass may produce
a scoped recovery; copy states the check's limits. Old readings are not reinterpreted
or backfilled. [History sampling](change-history.md) has independent state and does
not alter email eligibility, outbox or delivery.

## Scope and authority

Use one local notification job in this modular monolith, the existing PostgreSQL
instance/login, and an SMTP adapter. No broker, extra application deployment,
agent change, browser polling side effect or unauthenticated health endpoint.
`server/notifications` owns transition state, outbox, dispatch and safe status.
`server/skills` and `server/fleet` continue owning health and contact meaning.

Keep `readDiskHealth`, `readBaselineHealth` and inventory browser/API roots behind
their existing operator/session authorization, including the fresh completion
recheck. Extract transaction-scoped current-evidence reads and pure projections
inside their owning capabilities; browser detail reads and the notification root
both consume them. A notification does not fabricate an operator session, renew
one, call an HTTP read, or reproduce a second set of health rules.

The shared summary returns host/agent/generation, check key, desired source/policy
identity, current assignment, state/reason, `as_of` and next freshness boundary.
It excludes history, mount lists, recipes, credentials and raw observations.
Disk, baseline and contact projections preserve existing precedence, retention
receipts, sequence ordering, clock checks, recovery latches and applicability.
Contact `stale` means **offline** for email; revoked/never-contacted/clock-unknown
hosts are ineligible. An expired observation is never a recovered check.

Only a guarded local CLI/job root may invoke system evaluation. It validates the
expected database through the existing target guard and an explicitly configured
route; there is no HTTP system credential. Read-only local status uses the same
database guard. This is application-level separation on the existing owner role,
not database privilege isolation. Imports from routes/UI must use operator roots.

Evaluate contact, disk and the three baselines as separate bounded transactions;
there is no fleet-wide atomic health claim. Preserve lock order: family definition
locks (baseline keys sorted), then host, agent, current credential, then notification
state/outbox. Contact has no definition lock. Take shared host/authority locks for
the final sampling decision. Never hold disk and baseline definition locks together.
Capture one UTC instant per transaction after domain locks; do not let an older
sample overwrite a newer one. Clock rollback suspends work until time catches up.

## Transition policy

A subject is `(route epoch, host, agent, generation, contact or check key)`.
Each check also tracks the **desired** source revision/policy version. Source,
policy, generation or route changes end the old comparison scope, cancel its
unstarted work, and clear its recovery baseline. A missing delivered assignment
does not repeatedly reset that scope. Evaluate only current evidence in the new
scope; never enumerate or replay historical runs.

| Sample | Result |
| --- | --- |
| First healthy/current sample | Establish baseline; no email. |
| First current warning/critical, or offline contact | Queue one current problem notification. |
| Warning ↔ critical | Queue the changed severity; supersede unstarted prior severity. |
| Same definitive state | No reminder or new event, even after a failed attempt. |
| Check unknown/stale/not applicable/recovery-latched | Suspend check notifications; no recovery. Hold eligible pending work until fresh evidence returns or it expires. |
| Contact offline | Notify contact separately; check projections become unavailable and cannot also invent check failures/recoveries. |
| Healthy/current after a problem | Supersede unstarted problem work. Queue recovery only if that scope's problem had an accepted or uncertain attempt (capture simulates this in its own scope). |
| Revoked/replaced host identity or disabled/changed route | Cancel unstarted work; no recovery or transfer to another scope. |

Suspension preserves the last definitive state and whether the problem may have
been exposed. Returning to the same problem does not create another event; a held
pending event may resume within its lifetime. At a definitive clear transition,
consume that exposure marker whether or not recovery sending is enabled. This
prevents repeated recoveries. A new problem after clear starts a new incident.
Intermediate transitions missed while the worker is stopped are not reconstructed.
Once per state change means sampled, eligible transitions, not exactly-once SMTP
delivery or a promise to report every short-lived change.

Immediately before each attempt, rerun the owning current projection and transition
root in a short transaction. Require the same active route, authority/source scope
and desired state. Supersede obsolete work and defer unavailable evidence. Commit
the claim only for a currently eligible event. An agent/health change after commit
cannot recall an SMTP message; its body explicitly reports the sampled time.

## Durable state and concurrency

Add migration 009 with notification-owned tables; no existing observation rewrite.
Keep three concepts: route epochs, subject cursors, and transition outbox.

- Route/control: opaque epoch UUID, private configuration fingerprint, transport,
  current/enabled/paused state, fair host-scan cursor, last invocation time and at
  most 30 recent attempt-start timestamps for the rolling-hour limit. Retain old
  epochs; a partial unique constraint allows only one current route.
- Subject cursor: exact identity/source scope, last sample time, last definitive
  state, suspended flag, problem-exposure marker and monotonic transition number.
- Outbox: event UUID, scope/cursor reference, transition number, from/to state,
  sampled/created times, fixed template version, state, attempt count, next attempt,
  attempt UUID/start/finish, safe outcome code and optional acknowledgement time.

Use UUID/scope foreign keys, restricted deletion, enums/check constraints, unique
`(cursor, transition number)`, and due-work/scope indexes. State change, unique
outbox insert and allowlisted audit commit atomically. Pending-event supersession
and problem-exposure updates belong to the same root. A result is never inferred
from an SMTP message ID alone. Template 2 adds a bounded immutable message snapshot
(names, reading/contact instants, locale/zone, evidence identity and one optional
Details paragraph). Clear it at terminal delivery/cancellation; cleanup also clears
residual snapshots older than 90 days. Persist no rendered body, credentials, recipient
list, raw provider response or whole readings in these tables. Compact notification
metadata/audit is retained, like other authority history; the 90-day reading purge
does not delete it. Total metadata remains unbounded, as documented in [data lifecycle](data-lifecycle.md).

Serialize notification mutations with one project-specific PostgreSQL session
advisory lock on a dedicated checked-out connection. A second invocation exits
busy; all configure/run/acknowledge roots use it. Transactions remain short; only
the session lock spans transport I/O. Connection loss cancels the local attempt
and ends the invocation. Do not acquire a new lock and continue an old attempt.

Claim just one event immediately before transport: atomically persist `in_flight`,
a fresh attempt UUID/count and audit, then commit, then open the SMTP connection.
Finish through a compare-and-set on event/attempt/state under the same lock. If
the database finish fails, stop; never resend to obtain a cleaner result. On the
next lock acquisition, abandoned `in_flight` becomes `uncertain`, with audit and
problem exposure updated atomically. There is no expiry lease that requeues it.
A crash before actual sending can therefore yield a conservative false uncertainty.
A late callback cannot overwrite a recovered or acknowledged attempt.

| Transport result | Outbox state and policy |
| --- | --- |
| Positive final SMTP completion for the sole recipient | `accepted`; relay accepted responsibility, recipient delivery unconfirmed. |
| Capture adapter success | `captured`; never label this as delivered or accepted by SMTP. |
| Proven transient refusal/non-submission | `pending` with bounded delayed retry. |
| Permanent rejection, invalid configuration, exhausted retries | `failed`; visible, no automatic restart. |
| Lost connection/timeout after submission may have begun; ambiguous result/crash | `uncertain`; no automatic retry. |
| Superseded scope/state, disabled route, or age limit reached before sending | `cancelled` or `expired`, with safe reason. |

Only proven pre-submission failures and explicit SMTP negative completion replies
qualify as known non-acceptance. An error code such as `ECONNECTION` alone proves
nothing about delivery. Default unclassified post-submission errors to uncertainty.
Use a stable RFC Message-ID derived from event UUID for correlation across known
failure retries; providers are not assumed to deduplicate it. The local status
command shows pending/failed/uncertain counts and the last 50 outcome records using
internal IDs, times and safe codes. A guarded acknowledgement records that an
uncertain result was reviewed; it does not claim delivery and never resends it.
retention/notifications has no manual resend feature.

## Routing, content and adapter

Default `NOTIFICATIONS_TRANSPORT=disabled`; supported values are disabled, capture
and smtp. An explicit local configure operation creates/changes the active epoch.
Missing/malformed configuration or an unexpected fingerprint pauses dispatch and
emits safe status; it never silently adopts a new recipient. Configure must use
the same lock, retire old pending work and seed only future current-state sampling.
Capture events cannot be replayed through smtp.

The fingerprint covers transport, SMTP endpoint/TLS mode/account, sender, sole
recipient, warning/recovery flags, approved app origin and template version. Store
it only as protected configuration metadata; never log/export it. Password-only
rotation does not change transition identity. Configuration changes require the
worker to stop and reread settings; each claim compares its loaded fingerprint and
epoch to the active row. A disabled worker performs no sampling or communication.

Use the existing private SMTP fields plus `NOTIFICATIONS_FROM`,
`NOTIFICATIONS_TO`, `NOTIFICATIONS_INCLUDE_WARNINGS` and
`NOTIFICATIONS_RECOVERIES`. Validate one bare sender and recipient (no lists,
display-name syntax or control characters), explicit hostname, port 465 with
implicit TLS or 587 with mandatory STARTTLS, certificate verification, nonempty
account/password and the existing configured HTTPS app origin. Real values stay
in mode-0600 ignored configuration. Capture tests use synthetic configuration; real SMTP delivery is explicitly
configured by the operator.

Legacy template 1 sends a small plain-text message from the English catalog: fixed subject, bounded
host label, check/contact state, sampled time and fixed-origin host-detail link.
Template 1 includes no mount paths, package lists, execution output, reading bodies, attachments,
external content, tracking pixels, CC/BCC or agent-controlled URLs. Strip control
characters from the bounded label; MIME/header encoding belongs to the library.
Cap the composed message at 16 KiB. No message body or address in diagnostic/audit
output; safe CLI/status strings also belong to the catalog.

Select Nodemailer, behind a project-owned adapter, instead of implementing SMTP.
Its documented [SMTPConnection](https://nodemailer.com/extras/smtp-connection)
supports explicit connect/login/send/close lifecycle and
[MailComposer](https://nodemailer.com/extras/mailcomposer) handles MIME encoding.
Disable library logging and file/URL content access; use one connection/recipient,
no pooling or library retries. Track whether `send` began so timeout cancellation
can conservatively classify uncertainty. The adapter and types are pinned in the lockfile. Install dependency changes only
through the release procedure; retain dependency checks and license notices.

Project limits: 5-second DNS/connect/greeting timeouts, 10-second idle timeout and
30-second monotonic total attempt deadline, closing the socket on expiry. These
are deliberately short application submission limits, not general mail-transfer
guarantees. SMTP final-response loss can produce duplicates on retry, and positive
completion transfers responsibility to the relay; see
[RFC 5321 §§4.2.5, 4.5.3.2.6 and 6.1](https://www.rfc-editor.org/rfc/rfc5321.html).
The selected conservative policy accepts possible missed alerts to avoid blind
duplicate attempts. No SMTP response proves inbox placement/read receipt.

## Bounded job and recovery

The timer runs 60 seconds after the previous invocation completes, no missed-tick replay. Each
invocation rotates through at most 50 hosts with a 20-second sampling budget,
then at most five attempts; maximum 180 seconds total. Persist fair scan progress
after each fully sampled host; restarting a partial host is idempotent. A large
fleet takes multiple ticks; never claim a fixed fleet-wide delivery latency.
Before every claim count persisted attempts, limiting all retries/new messages to
30 starts per rolling UTC hour per route. Prune starts outside the last elapsed
hour and append the new start in the route's bounded timestamp list; cooldown/rate
checks, this update and the claim are atomic. Audit is not a second rate counter.
Use at most three attempts per event: initial, then 5 and 30 minutes after the
preceding known transient failure. Stop at 24 hours from event creation; repeated
samples never renew that lifetime or reset an exhausted attempt count.

SMTP runs never hold a database transaction open. Recheck monotonic invocation
budget before starting an attempt; leave enough time for its deadline and finish.
Clock rollback against stored sample/attempt times pauses, with safe status.
No email announces a mail-system error; expose it locally to avoid recursion.

After database restore, keep notifications disabled. A restored pending event may
already have been sent after the backup. Retire the restored route epoch under the
guarded configure procedure before enabling a new one; never drain the restored
queue. This may send one new current-incident alert, not old queued history. A database backup does not restore external mail state. Reconcile credentials
and recovery latches before resuming jobs.

## Local commands

Migration 009 introduced notification state. Apply all current migrations before
invoking the current tools. Node 24 can load the private base environment
and a mode-0600 ignored notification file, then call the existing `tsx` entry point:

```sh
node --env-file=.env.production.local --env-file=.env.notifications.local node_modules/tsx/dist/cli.mjs scripts/notifications.ts status --expected-database tinywarden
node --env-file=.env.production.local --env-file=.env.notifications.local node_modules/tsx/dist/cli.mjs scripts/notifications.ts configure --expected-database tinywarden
node --env-file=.env.production.local --env-file=.env.notifications.local node_modules/tsx/dist/cli.mjs scripts/notifications.ts run --expected-database tinywarden
```

Run from the repository root. `configure` is repeatable at an unchanged fingerprint and can
unpause confirmed settings. After a restore, use `configure --expected-database
 tinywarden --rotate` to retire the restored epoch even when settings are unchanged.
`acknowledge --expected-database tinywarden <event-uuid>` records local review of an
uncertain event without changing its outcome or sending again. `status` omits
fingerprints, settings, labels, body, addresses and credentials. The CLI catches
errors with a catalog message; safe outcome codes and audit provide the record.

The driver owns one checked-out PostgreSQL session; its exact backend PID is watched
for connection errors through the database adapter. Connection loss aborts the
transport immediately, without a separate polling loop. The next valid locked root
recovers any abandoned claim to uncertainty. Configure recovers interrupted claims
before rotating identity. Route retirement uses one atomic bounded-time SQL update
and one route audit; individual state supersession/expiry records event audit.

The locked Nodemailer adapter owns SMTP/MIME. Capture and loopback SMTP fixtures
use synthetic identities; they do not establish real provider delivery. Relay
acceptance is not proof that the recipient read the message.

## Skill Details extension

Status: **implemented in template 2**. The
[Details v1 contract](skill-notification-details.md) specifies the optional file,
bindings, allowed styles, examples, schema and compatibility. Catalog strings stay
plain text; the app creates HTML and equivalent plain text from structured marks.
Notification eligibility and retry/exposure rules remain unchanged.

One optional `Details` paragraph may explain the affected skill's condition.
All other email content belongs to the app: subject, severity, server and skill
identity, state, times, recipient and the fixed-origin server link. Subjects carry
severity for issues and distinguish agent contact restoration from skill
resolution; the product name is omitted from subjects.

The paragraph permits plain text and exactly three inline styles: **bold**,
*italic* and underline. Styles must be represented as validated structured
formatting in the declared package message, not arbitrary skill-supplied HTML or
a general Markdown renderer. No other styles, headings, lists, colors, fonts,
links, images, attachments, scripts or layout controls are permitted. Placeholder
values are typed, escaped literal data and never parsed as formatting or markup.
The app generates the restricted HTML email body and an equivalent plain-text
alternative from the same validated content.

The bound is 400 visible characters after placeholder substitution,
with at most64 text fragments as defined in Details v1. Invalid,
missing or oversized details fall back to the generic notification; they never
suppress an otherwise eligible alert. The details must describe the same accepted
reading and assessment as the message metadata, not newer readings labelled with
an older event time. Declare translatable wording in the versioned package
catalog, using the existing typed-placeholder model. Do not run skill code while
composing or sending mail.

Keep warnings and recoveries specific to the monitored signal. A disk threshold
is crossed at **or above** its value. A clean package plan does not prove packages
were installed. An absent reboot marker does not prove a reboot occurred.
A healthy trim schedule does not prove a trim run completed or space was reclaimed.
Formatting validation controls presentation, not the accuracy of skill reports.

## Contact evidence

Contact lost/restored transitions use the latest accepted current-agent
communication, including successful skill control traffic, rather than only the
heartbeat receipt. Credential revocation, invalid requests and rejected results
cannot refresh it. Contact recovery does not imply that a skill recovered; skill
notifications continue to use their independent assessments and freshness.
