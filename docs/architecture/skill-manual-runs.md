# Run now

Run now requests a fresh observation using a skill's ordinary `collect` entrypoint.
It does not install updates, run a trim service, or change permissions. Every
compatible package supports it without additional author code, settings or SDK hooks.
The resulting reading follows the existing interpretation, history, charts and alerts.

## Operator API

A server's ordinary `GET /api/v2/operator/hosts/{host}/skills` response includes
`manual_run` for each skill: `can_request`, `unavailable_reason`, `expected_context`
and `latest` (null or a request summary). The summary contains `id`, `phase`,
`reason`, `requested_at`, `started_at`, `completed_at` and `run_id`.

Send `POST /api/v2/operator/hosts/{host}/skills/{installation}/run` using the existing
operator session, same-origin policy and `X-TinyWarden-Request: 1` header:

```json
{"schema_version":1,"request_id":"<client UUID v4>","expected_context":"<SHA-256 from current server response>"}
```

A successful response contains `schema_version: 1` and `result`, a request summary.
Keep the client request ID and exact body across uncertain replies. An exact retry
returns the original request. Other clicks while it is pending join the same request;
reusing an ID with different input returns409. A stale context returns409. The
context binds host, agent generation, package digest and all settings/policy versions.
A disabled skill, disconnected agent, unready runtime or agent without support cannot
accept a new request. There are at most eight pending requests per server and one
per installed skill. A new global or per-server setting invalidates pending authority.

## Progress and timeouts

Queued requests expire after five minutes. Delivery is not proof of execution:
Running begins only after an authenticated start acknowledgement binds the durable
agent run ID and sequence. Collection is bounded to90 seconds from that acknowledgement
and by the ordinary assignment lease/collector limits. Results are expected within120
seconds. Failed timeout means no result arrived in time; it does not mean no code ran.
A late valid reading can still update normal monitoring without changing that timeout.
Completed means a valid observation, including an observation reporting Warning or
Unknown. Runtime/interpreter failures are Failed. No timeout automatically requeues.
The widget clears completed-request feedback instead of duplicating its timestamp;
the ordinary header and History retain the reading. Pending and failed feedback remains.

The UI refreshes the existing results every two seconds while a request is pending,
with one fetch in flight, then returns to normal polling. Progress survives navigation
and reload. Manual collection before the next scheduled check leaves its due time
unchanged; collection when the scheduled check is due can satisfy both. The existing
single fair worker, upload backpressure and independent heartbeat remain.

## Agent protocol and durability

Upgraded agents advertise `X-TinyWarden-Capabilities: skill_runs.manual.v1` on the
existing assignment POST; the JSON body is unchanged. Only advertising agents receive
`manual_runs_supported: true` and optional assignment
`manual_request: {"id":"<UUID>","expires_at":"<ISO UTC instant>"}`. Older agents receive
neither field. An upgraded agent talking to an older app keeps ordinary scheduling.

Before collection the agent atomically persists active run, sequence and consumed
request ID, then sends `POST /api/v2/agent/skill-run-starts` with `schema_version: 1`,
`manual_request_id`, `assignment_id`, `run_id` and integer `run_sequence`. A200 response
returns that exact identity and `run_deadline`. Same-identity claim replay keeps the
original deadline. Other identities, expired requests and changed authority are rejected.
The agent never collects without a matching acknowledgement. An interrupted claim or
restart produces `execution_failed` under the same identity, rather than retrying code.

The normal skill-run upload adds `manual_request_id` only for manual runs. Legacy
fingerprints remain unchanged. The app validates correlation before interpretation and
again at acceptance; successful acceptance and request completion share one transaction.
Receipt replay repeats no effects. Consumed IDs prevent a cached request from running
twice; pending upload bytes remain durable and unchanged across retries.

Request details expire after90 days through bounded existing maintenance. Compact
operator receipts remain: an old retried command returns `detail_pruned`, never new work.
Request rows do not prevent reading retention.

## Upgrade

Apply app/schema018 and matching background jobs first, then upgrade the agent binary
while preserving its configuration, identity, sequences and state. Run now stays
unavailable until support is advertised. No package/SDK update is required. The new
agent reads old state files. A binary-only downgrade cannot read every new state field;
recover forward, never reset counters or blindly restore previously accepted state.

## Contact during start

A valid incoming start proves contact independently of the last heartbeat. Its
transaction may provisionally advance separate contact after current credential
authorization before checking current scope. Every later rejection rolls that
contact update back; queue, lease, runtime, configuration and execution deadlines
remain enforced. A successful exact start replay can refresh contact without
allocating or starting another run. Operator requests themselves never count.
