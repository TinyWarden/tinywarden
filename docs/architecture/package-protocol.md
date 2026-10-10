# Generic package protocol (SDK v1)

The Go agent and TypeScript app keep their existing enrollment/heartbeat identity.
New package routes live under `/api/v2/agent/`; their JSON schema_version is 1.
They require the current agent credential and reject cookies, origin headers,
unexpected queries/fields and oversized or ambiguous JSON.

| Route | Request | Result |
| --- | --- | --- |
| POST skill-assignments | runtime_ready boolean | Current generation as a decimal string, server-issued five-minute lease and at most100 enabled installations. Ready entries pin installation/assignment UUIDs, subject, content digest, grants, effective settings and interval. Unavailable entries do not authorize execution. |
| POST skill-runs | run/assignment UUIDs, safe integer sequence, millisecond UTC start/finish, outcome and bounded observation (null on failure) | Exact run UUID/sequence and original received_at receipt. Changed retries fail; revoked/stale authority cannot advance state. |

Sequences are durable per installation within credential scope. The agent writes an
active run before execution and exact request bytes before delivery. Interrupted
work becomes execution_failed under the same UUID/sequence after restart. A bounded
queue applies backpressure; the single fair worker runs independently of priority
heartbeat. No catch-up burst or implicit credential reset occurs. Runtime/cleanup
failures report unknown and never resume compiled collectors in the package lane.

The server snapshots/rechecks authority around bounded pure reduction/evaluation;
package code runs outside SQL locks. Immutable raw observations and assessments
retain their original digest/catalog. Delayed observations are retained without
replacing newer state. Read paths/history/email select stored timed assessments;
they never execute a package. Evidence expires after three configured intervals,
contact/authority changes can make it unavailable sooner, and original receipt age
enforces the90-day retention boundary. Compact receipts survive detail pruning.

`/api/v2/operator/skills` and host skill routes expose shared metadata, controls,
defaults, individual overrides and retained readings. Operator mutations retain
same-origin/CSRF, optimistic-counter, exact-retry and current-session guards.
ZIP upload and exact assignment download extend the generic API. Existing v1 endpoints remain for
agents without platform assets. Modern agents advertise readiness through v2;
their official aliases replace legacy projections once that mode is recorded.

## Package transport and updates

Operator skills and host-results GET responses are paginated by aggregate byte
size. `page` is an optional decimal offset (0–200); `next_page` is the next offset
or null. Most pages stop around 512 KiB; a single valid record may require a
larger page, up to 4 MiB. Reading catalogs travel with their reading and may repeat
across pages. Clients must assemble all pages before replacing their displayed
view and deduplicate catalogs by content digest. Every page checks the current
operator session. This does not change agent assignment or upload envelopes.

- Operator `POST /api/v2/operator/skills/upload`: raw `application/zip` body, at
  most 10 MiB; cookie, canonical Origin and `X-TinyWarden-Request: 1` required.
  `X-TinyWarden-Upload-ID` is a UUID request nonce. Its receipt pins actual input
  archive bytes as well as content identity; retry the same file and nonce after an
  uncertain response. New installations are disabled and updates stay unselected.
- Operator `GET /api/v2/operator/skills/:id/version`: actual admitted versions,
  selected flag and settings-schema compatibility; optional content_sha256 query
  returns one full version metadata record for access review. POST to the same route uses
  versioned JSON: request_id, content_sha256, expected_enablement_version, grants.
  Fresh approval must match that version's exact declared capabilities.
- Ready assignments optionally include `archive_sha256` and `archive_bytes`.
  This additive extension preserves existing cached packages and older agents.
- Agent `GET /api/v2/agent/skill-packages/:assignmentId`: bearer credential only;
  no query, cookie, Origin or redirects. The assignment must match current agent
  generation, host, enabled package, settings/policy counters and unexpired lease.
  Returns application/zip with exact content length and separate
  `X-TinyWarden-Archive-SHA256` / `X-TinyWarden-Content-SHA256` headers. The agent
  checks both identities, byte count and admission before execution. Failure leaves
  the cache unchanged. These are private responses, never public static URLs.

## Agent contact

Successful assignment polling, verified assigned archive requests, accepted result
uploads and exact valid receipt replays refresh the current credential's separate
contact evidence. Empty polls and unavailable runtimes still prove contact. Result
preparation, state-cursor retries, rejection and failed transactions do not. Original
receipt timestamps and result/metric idempotency stay intact. Collection freshness
and health use independent reading evidence. See [agent contact](agent-protocol.md#contact-state-and-operator-view).
