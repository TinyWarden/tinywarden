# Security and privacy boundaries

Protected material includes credentials, enrollment tokens, operator sessions,
host metadata, readings and settings. There is no product telemetry or external
diagnostic exporter. Tests use synthetic data and private disposable resources.

## Authority and storage

[Access](access.md) owns login, session/origin checks, token consumption,
credential replacement/revocation and audit. Every protected record/mutation checks
current authority on the server. Hidden UI and middleware alone are insufficient.
Tokens expire and are atomically consumed; agent credentials are host-scoped,
hashed, revocable and replaceable. [Agent protocol](../architecture/agent-protocol.md)
owns exact retries and generation-scoped durable state.

[Database ownership](../architecture/data.md#postgresql-ownership-and-test-targets)
uses one non-superuser login for app access and migrations. It retains DDL and
audit-table authority. Application audit writes are transactional and append-only
by behavior, not tamper-resistant against the database owner. Live/test databases
are target-guarded operationally; this login does not provide privilege isolation.

## Host execution

[Disk collection](../architecture/disk-observations.md#agent-service-view) performs
bounded metadata reads from the real host mount view. The dedicated account is
unprivileged; missing coverage cannot become healthy. The service deliberately
avoids mount-namespace sandbox options that would hide filesystems.

[Python package execution](../architecture/skill-runtime.md) uses namespaces,
seccomp and delegated CPU/memory/PID budgets. Code observes only approved read-only
broker capabilities within the agent's local ceiling. Package metadata and pure
interpretation are isolated too; request paths never import package code directly.
There are no install hooks, shell setup or maintenance actions. Only bounded,
schema-validated observations and package-owned facts are accepted.

The [compiled compatibility runner](../architecture/recipe-execution.md) remains
available for agents without platform assets. Its whole-recipe policy, argument
arrays, deadlines and cleanup are separate from the generic package lane.

Authenticate before revealing assignment hints or scoped results. Strict bounded
JSON rejects duplicate/unknown fields. Durable sequence, queue, pause and recovery
latches prevent restored/corrupt state from silently reauthorizing old evidence.
A valid digest cannot authorize different argv, user, cwd or environment.

## Exposure and notifications

Require verified HTTPS for agent traffic. Apply origin checks, request/concurrency
limits and safe allowlisted logs even when a request bypasses the proxy. Never log
credentials, raw payloads, process environments or customer content; see
[configuration](../deploy/configuration.md).

Agent JSON routes check credential headers before reading bodies, then recheck
authority in their command transaction. JSON bodies have a 15-second total read
deadline; unverified body readers share eight slots within the 64-request ceiling.
This reserves capacity for authenticated agent traffic during incomplete uploads.

New agent-owned results, metrics, immutable receipts and assignment snapshots are
charged to a durable per-agent allocation budget. Its default ceiling is 2 GiB in
conservative allocation units (four times row size plus 1024 bytes per row, covering
index/headroom costs), not a measurement of filesystem usage. Fresh result inserts
share 256 burst tokens replenished at four per second; assignment inserts share
256 tokens replenished at one per minute. Legacy capability changes additionally
wait 60 seconds between snapshots. Limits reject and roll back new allocations
with 503; heartbeats, unchanged assignment reads and exact receipt retries remain
available. Credential replacement does not reset the budget.

The existing 90-day cleanup refunds deleted detail and metric allocations while
keeping immutable retry receipts. No history or receipt is removed just to meet a
quota. Inspect `agent_storage_budgets.used_bytes` and `max_bytes` on the owned
database when capacity is exhausted; an administrator may explicitly raise the
ceiling after reviewing storage capacity. These per-agent controls do not replace
database disk monitoring or an installation-wide capacity plan.

[Email](../architecture/notifications.md) uses guarded local system roots, not a
browser bypass or host-execution grant. Recipient/provider settings remain private.
Only bounded catalog content, host label/state/time and a fixed-origin link leave
via SMTP. Synthetic capture uses no real route. Uncertain attempts are visible
and never automatically resent.

Keep suspected exploitable issues and secrets out of public issues; use a private
reporting channel. Release dependency/secret checks complement focused authorization
and recovery checks; they do not establish correctness of these boundaries alone.
