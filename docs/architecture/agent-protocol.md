# Agent protocol v1 and contact state

Status: P1.2 implementation contract, selected 2026-09-28. P1.B implements
new-host enrollment; P1.C implements heartbeat, client persistence and fleet
contact state locally. Replacement remains P1.D work.
[Access](../security/access.md) owns authority and secrets;
[data](data.md) owns persistence. P1 carries enrollment and contact evidence only.
Check assignments, execution results and commands belong to later versioned work.

## Shared wire rules

Use HTTPS at one configured origin. Client validates the system CA chain and hostname,
requires TLS 1.2 or later, refuses redirects and never disables verification. No inbound
agent listener. Public HTTP is not a fallback. Disposable tests use a test CA in an
isolated test client. P1's first supported distribution is Debian 13; record actual
tested architectures with P1.D evidence instead of claiming untested portability.

API prefix `/api/v1`; body `schema_version` must be the number 1. Requests/responses
use UTF-8 JSON, application/json, with no content encoding. Reject unknown request
fields and wrong types rather than coercing. IDs are canonical lowercase UUIDv4.
Instants use canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`, valid calendar values and years
0001–9999. Client time is observational, never authority for expiry or contact freshness.
Bound all API bodies to 16 KiB while streaming, even without Content-Length. Exceeding
the limit gives 413; unsupported media/encoding 415; malformed/invalid input 400.
Client bounds response bodies to 16 KiB too. Operator paginated reads use their
separate 128 KiB response cap in the data contract.

Errors have `{schema_version:1,error:{code:<stable_code>},request_id:<server_uuid>}`.
Codes are machine identifiers; web/CLI map them through English catalogs. Never
return raw parser/SQL/exception text. Invalid authority gives generic 401
`unauthorized`; valid but forbidden browser origin gives 403 `origin_rejected`.
Database/timeouts give 503 `temporarily_unavailable`; 429 `rate_limited` includes
Retry-After integer seconds. No auth response reveals whether an unknown ID exists.
Unsupported schema version gives 400 `unsupported_version` with no mutation.
The sole authenticated error extension is token_already_issued's error.token_id,
specified by the operator API. Clients validate all required successful response
fields and version, and may ignore additional response fields without assigning
them authority. The agent classifies error HTTP status before reading its body:
401 and 409 retain their safe authority/conflict categories even if the body is
interrupted; 429 and 5xx retain bounded retry handling. A malformed error body
cannot turn a terminal rejection into a retry. For permitted success statuses,
reject unsupported media or encoding before reading the body, while an interrupted
valid response remains retryable with the same saved request.

## Enrollment: POST /api/v1/agent/enroll

Authorization: Bearer enrollment token. Cookie sessions are not accepted.

| Required request field | Shape and meaning |
| --- | --- |
| schema_version | 1 |
| request_id | Agent-generated UUID, persisted before the first attempt |
| credential | `tw_a_<uuid>.<secret>` generated and saved by this agent; never echoed |
| hostname | Reported name, 1–253 ASCII letters/digits/dots/hyphens; descriptive only |
| os_id | 1–32 lowercase ASCII letters/digits/underscore/hyphen |
| os_version | 1–64 printable ASCII characters |
| architecture | 1–32 ASCII letters/digits/underscore/hyphen |
| agent_version | 1–64 ASCII letters/digits/dot/plus/hyphen |

Success body: `{schema_version:1,host_id,agent_id,credential_id,generation,
heartbeat_interval_seconds,stale_after_seconds}`. All fields required, IDs as above;
generation is a positive safe integer. 201 means newly committed enrollment;
200 means exact committed replay. The response contains no secret. The agent verifies
credential_id against its pending credential and persists the bound IDs before use.

New token consumption is valid only while `now < expires_at` and not revoked/consumed.
An effective clock before the token's issued_at also fails closed.
It atomically creates host+agent+credential, consumes the token and records audit.
Replacement consumption follows the lifecycle in the access contract; target and
expected generation come from the stored token, never agent-supplied host IDs.
No new host is created during replacement. Unique constraints defend credential and
request identities even under concurrent first requests.

| Situation after authentication/locking | Outcome |
| --- | --- |
| Unused, unexpired token and valid new request | 201; exactly one state transition and audit |
| Consumed token, same request_id and canonical fingerprint, active bound credential, `now < consumed_at + 24h` | 200; original success fields; no contact or audit update; original issuance expiry no longer controls this read-only replay |
| Consumed token, different request or fingerprint | 409 `enrollment_conflict`; no mutation |
| Expired unused token, revoked token/agent/credential, or replay window elapsed | 401 `unauthorized`; no mutation |
| Replacement token's generation no longer current | 409 `generation_changed`; no replacement |
| Credential UUID/digest already belongs to another accepted request | 409 `credential_conflict`; existing record remains unchanged |

Fingerprint is SHA-256 of UTF-8 JSON.stringify of the ordered array:
`[1, request_id, credential_digest_hex, hostname, os_id, os_version, architecture,
agent_version]`. Validate first; no normalization after hashing. The raw credential
never enters persisted fingerprint input, audit or logs. Compare fingerprint and
request_id under the token lock; never return a successful replay for changed input.
Consumed-token replays recheck current agent/credential authority, including token
revocation, even though they do not mutate state. New agent IDs are server-generated.

## Heartbeat: POST /api/v1/agent/heartbeat

Authorization: Bearer current agent credential. Resolve host/agent from that credential;
the body contains no host ID. Cookies and enrollment tokens confer no access.

| Required request field | Shape and meaning |
| --- | --- |
| schema_version | 1 |
| sequence | Integer 1–9007199254740991; increasing within this credential generation |
| sent_at | UTC instant; descriptive client clock only |
| agent_version | Same bound as enrollment |

Success body: `{schema_version:1,sequence,accepted_at,duplicate,
heartbeat_interval_seconds,stale_after_seconds}`. HTTP 200; duplicate is boolean,
accepted_at is original authoritative receipt time, and sequence matches the request.
Both cadence values are the enrollment snapshot and cannot be changed by the agent.
Client response validation enforces interval 10..300 and grace between three
intervals and 3600; inconsistent/out-of-range cadence is a protocol error.

After locking the host/agent/credential and checking active authority, compare sequence
with the credential's stored last_sequence (initially 0):

- Greater: update the current heartbeat snapshot, sequence and fingerprint atomically.
  The fingerprint hashes UTF-8 JSON.stringify `[1,sequence,sent_at,agent_version]`.
  Use `accepted_at=max(captured_now, previous_accepted_at)` to avoid backwards contact
  timestamps during a clock regression. Return duplicate=false after commit.
- Equal with equal fingerprint: return duplicate=true and the original accepted_at.
  Do not move last contact, counters or audit. Equality with changed content returns
  409 `sequence_conflict` and leaves state unchanged.
- Lower: return 409 `sequence_superseded` and leave state unchanged. The single-writer
  agent treats this as a local-state fault, not permission to guess another sequence.

Thus idempotency identity is `(credential_id,sequence)`. Only the latest fingerprint
is retained. Very old retries get an explicit superseded outcome; they cannot freshen
a host. No heartbeat history table is needed in P1. Sequence exhaustion requires
operator-approved credential replacement, not wraparound. Replacing a credential
starts its sequence at 0 and clears the agent's last contact to unknown.

## Client persistence, scheduling and failures

One agent process owns the private state directory. Maintain one outstanding request
per credential. Persist its sequence/body before sending. After matching success,
persist acknowledgment before preparing the next sequence. If interrupted, retry the
same saved request; never reuse a sequence with different content. A corrupted/missing
state file or sequence conflict stops sending and requires operator recovery. A clean
shutdown cancels in-flight network work without deleting pending state.

Pending requests must also survive a binary upgrade. Persist the original
agent_version with the complete enrollment/replacement input; replay that snapshot
without substituting the running binary's version. A pending heartbeat retains its
original, wire-valid agent_version until acknowledged. Only a new request uses the
new binary's version. For the known legacy 0.0.1 local state shape, a missing
enrollment/replacement agent_version means 0.0.1. Upgrade and durably save that
shape before network use; reject unknown formats instead of guessing. A code
rollback must separately verify compatibility with the actual saved state shape.
A pre-field binary has a strict state reader and rejects an expanded pending
enrollment/replacement containing agent_version. Do not remove that field or restore
an earlier state to force a downgrade; recover the pending request with compatible
code first and verify the exact rollback revision against the resulting state.

Heartbeat after enrollment, then after each successful response wait the returned
interval plus uniform jitter in [0, interval/10]. Each network attempt has a 10-second
total deadline; connection/TLS setup is bounded to 5 seconds within that deadline.
Honor cancellation. Attempt a request at most five times per cycle, with four
equal-jitter waits between half and all of 2,4,8,16 seconds. After the fifth
failure, enter a visible degraded state and make one attempt per 300 seconds
plus 0–30 seconds jitter until success. Cap valid Retry-After to 900 seconds and wait
at least that long; use the normal schedule for malformed values. One persisted
request is the whole P1 buffer, with no outage catch-up burst.
The latest response's Retry-After applies to every next attempt, including entry
to degraded mode. Response-body network interruptions remain retryable with the
same saved request; actual size/media/JSON violations remain protocol failures.

401 stops authenticated polling and preserves state for operator action. 400/403/404/
409/413/415 and incompatible responses are terminal protocol/configuration errors;
do not invent new credentials or re-enroll automatically. TLS validation errors also
stop and require correction. Enrollment retry ends at the server's token/replay rules.
An operator may explicitly replace an expired pending enrollment with a new token;
retain ambiguous prior state until the old token/credential has been accounted for.

## Contact state and operator view

Initial server defaults: heartbeat every 60 seconds; stale after 180 seconds. On
enrollment, snapshot the validated deployment defaults onto the agent. A later default
change affects new agents only. Replacement retains the snapshot. P2 may add an
explicit, versioned policy update; no silent inherited/override semantics in P1.

Capture UTC now once after required locks for each mutation and once per read result.
All list/detail rows in that result share the reference time. Derive in this order:

| Condition | Contact state |
| --- | --- |
| Agent revoked | revoked |
| No accepted heartbeat for current generation, or now before last contact | unknown |
| 0 ≤ now − last contact < stale_after_seconds | current |
| now − last contact ≥ stale_after_seconds | stale |

Current proves recent contact only; health stays unknown until actual check evidence
exists. The UI must not label a P1 host healthy. Show last accepted contact and a
catalog-backed explanation. Database/read failure means unavailable, never an empty
fleet or current status. Reads are uncached; refresh on navigation, explicit refresh
and every 30 seconds while the fleet view is visible. Pause hidden-tab polling,
cancel on navigation/session loss, prevent overlapping requests and discard older
responses. On fetch failure retain data only with an explicit outdated indicator;
never retain an unqualified current badge past its supplied freshness deadline.
Use server as_of plus monotonic elapsed time for that display deadline, conservatively
subtracting the full request duration from remaining freshness; never trust browser
wall-clock alignment. At deadline mark the displayed evidence outdated and refresh;
only a successful authoritative response can establish a new current state.
Fleet reads have a 15-second total browser deadline covering response headers and
body parsing. Timeout releases the request slot and permits an explicit retry while
showing unavailable/outdated evidence. A 401 or successful logout stops subsequent
polling and visibility-triggered requests and clears protected data. Check request
identity before applying any response, including an authorization failure.
