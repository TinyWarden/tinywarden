# Host-agent protocol

This reference describes the current app and Go client. Exact decoders and replay
tests are authoritative for individual request fields. SDK/package formats are
separate from HTTP route versions and JSON `schema_version` values.

## Transport and enrollment

The agent connects outbound to one configured HTTPS origin, requires certificate
verification and TLS 1.2 or later, refuses redirects and opens no inbound listener.
Agent roots accept a bearer credential, not an operator cookie. They reject Origin
headers, unexpected queries, unsupported fields and ambiguous JSON.

`POST /api/v1/agent/enroll` uses a one-time enrollment token. The v1 body includes
`request_id`, `pending_credential`, hostname, OS, architecture and agent version.
The credential and pending request are persisted before sending. Successful
enrollment atomically binds host/agent identity, credential generation, token
consumption and audit, returning IDs/cadences without echoing the credential.

An exact enrollment replay can recover a lost receipt within its supported window
(24 hours), while that authority remains active. Changed bytes conflict; expired or
revoked authority is rejected. Do not create another identity to resolve an
uncertain response.

## Heartbeat and contact

`POST /api/v1/agent/heartbeat` carries schema 1, a durable positive sequence,
`sent_at` and agent version. A greater valid sequence records new evidence. An
identical sequence/body returns the original receipt; changed reuse conflicts and
a lower sequence is superseded. The client persists exact pending bytes before
delivery and the acknowledgement before advancing its counter.

Heartbeat scheduling has priority over skill work. Normal transport uses a
10-second total timeout, 5-second connect budget and bounded exponential retries.
Temporary rejection retries the same identity/bytes; an authorization rejection
pauses the affected authority. An upgrade retains the original pending version and
body rather than rewriting a retry.

Accepted package polls/downloads/results and valid receipt replays also refresh
separate credential contact evidence. Replays retain their original receipt time.
Neither a contact refresh nor a successful assignment poll makes old readings fresh.
Current/stale contact uses server acceptance evidence and the assigned threshold,
not an untrusted host clock.

## Generic package lane

| Route | Request/result contract |
| --- | --- |
| `POST /api/v2/agent/skill-assignments` | Schema 1 request with `runtime_ready`; response pins current decimal-string generation, issued/expiry lease and at most 100 enabled installations |
| `GET /api/v2/agent/skill-packages/{assignment_id}` | Current assignment authorization; exact ZIP bytes with archive/content SHA-256 headers |
| `POST /api/v2/agent/skill-runs` | Run UUID, durable per-installation sequence, assignment UUID, UTC millisecond start/finish, outcome and bounded observation; exact UUID/sequence/original `received_at` receipt |
| `POST /api/v2/agent/skill-run-starts` | Claim a queued manual request with its assignment/run UUID and sequence; return the bounded execution deadline |

Polling sends `X-TinyWarden-Capabilities: skill_runs.manual.v1` for manual support.
Resource-capable clients also send
`X-TinyWarden-Package-Features: skill_resources.python313.v1`. SDK 2 assignments
require that exact feature and a schema 2 assignment response. Unsupported clients
receive unavailable entries instead of executable SDK 2 work.

A ready assignment pins installation/assignment IDs, subject key, content digest,
effective settings, approved grants and interval. Optional archive digest/size let
the client verify transport separately from package content. Leases last at most
five minutes. Downloads recheck host/generation, current selected package,
enablement/settings/policy counters and lease. Cache replacement requires both
identities, byte count and successful admission. Runtime unavailable entries do
not authorize collection.

The client persists active work before executing and exact completed request bytes
before upload. Interrupted work is reported as failed under the same run identity.
A single fair worker, an 8 MiB persistent queue and bounded retries apply
backpressure; they do not create catch-up bursts or reset credentials. SDK 2 results
add bounded resource inventory/selection evidence under the same replay rules.

Run admission snapshots context, performs bounded pure evaluation without SQL
locks, then rechecks authority/context before storing immutable observation and
timed assessment. Delayed valid observations cannot replace newer current state.
Compact receipts continue to reject changed retries after detail retention.
See [resource identity](skills/resources.md) and [data lifecycle](data-lifecycle.md).

## Manual requests

An Admin requests fresh collection against the exact current context. There is at
most one active request per host/installation and eight per host. A queued request
expires after five minutes. The agent claims it before execution, receiving up to
90 seconds (bounded by the assignment lease); the result deadline is two minutes
from start. Scope changes, expiration and interruption are explicit failures.
Manual collection uses the same grants, sandbox, reducer and evaluator as scheduled
work; it is not an arbitrary command facility.

## Envelopes and errors

Canonical UUIDs, finite safe integer counters and UTC timestamps are validated by
the owning decoder. The shared small JSON envelope is 16 KiB; package/result routes
use their explicitly larger bounds, generally up to 1 MiB. Downloads and operator
uploads use the separate [package archive limits](skills/package-format.md).
Do not infer an unbounded body from a route's `/v2/` name.

Errors return a safe code and request ID. 401 indicates unavailable authority,
403 a rejected origin/boundary, 409 a conflict, 429 a rate limit and 503 temporary
unavailability. Honor bounded `Retry-After` for temporary responses. Preserve
identity/state when handling errors; deleting queues or guessing a new sequence
destroys replay safety.

Legacy `/api/v1/agent/assignments`, disk and baseline assignment/run endpoints
retain fixed compiled recipe/observation contracts for older agents. They do not
accept arbitrary shell instructions. Their byte-level fixtures remain compatibility
inputs; new capabilities belong in the generic SDK, not another legacy recipe.

## Source and tests

- App [package HTTP roots](../../server/http/package-handlers.ts),
  [assignments](../../server/skills/assignments/packages.ts),
  [result admission](../../server/skills/results/package-runs.ts) and
  [manual lifecycle](../../server/skills/manual).
- Go [client protocol](https://github.com/TinyWarden/tinywarden-agent/blob/main/internal/agent/protocol.go),
  [package types](https://github.com/TinyWarden/tinywarden-agent/blob/main/internal/agent/package_types.go)
  and [package protocol](https://github.com/TinyWarden/tinywarden-agent/blob/main/internal/agent/package_protocol.go).
- App [vendored agent fixtures](../../tests/fixtures/agent) and
  [package tests](../../tests/skills/packages). Match both consumers when changing
  transport; source availability alone does not establish released compatibility.
