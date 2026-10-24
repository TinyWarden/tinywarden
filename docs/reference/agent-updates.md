# Managed agent updates

The application selects verified official stable releases; the installed root
updater verifies and installs their signed binary/runtime together. The monitoring
daemon remains unprivileged. This interface accepts no arbitrary command, URL or
skill operation. Human instructions: [agent operations](../operating/agents.md).

## Capability and release selection

`agent_updates.v1` is the existing maintenance policy capability. Remote-capable
agents additionally report `remote_updates: true` in their platform observation.
The app policy advertises `agent_update_requests.v1`; releases using request
polling require both app capabilities in their signed release metadata. Upgrade
the app/schema first. Older agents need one server-side manual upgrade; an app
cannot remotely add an updater capability to an agent that lacks it.

Fleet menus and confirmations use the shared [Fleet action policy](fleet-management.md#action-eligibility-and-explicit-bulk-scope).
Unavailable actions are omitted. Mixed selections show counts and named skipped
servers; only reviewed eligible targets and version pins are submitted.

Admin Fleet selection requires a managed active or paused host on the supported
platform, a recognized signed running version/hash identity, no active request or
unsafe updater outcome, and a fresh verified catalogue (under 24 hours). The request
pins exact manifest/signature bytes and host/agent/credential generation. Offline
contact does not itself invalidate a recognized installation or make it healthy.
The requester must remain an enabled Admin at subsequent delivery/reconciliation.

## Root-updater endpoint

`POST /api/v1/agent/update-requests` uses the enrolled bearer credential and the
ordinary closed agent JSON/HTTPS boundary. No Origin, query or operator cookie is
accepted. Request fields are exactly:

```json
{
  "schema_version": 1,
  "host_id": "host-uuid",
  "agent_id": "agent-uuid",
  "generation": 1,
  "request_id": null,
  "state": "poll",
  "error": null
}
```

A poll with null ID returns the oldest active scoped request, or null. An explicit
ID retrieves that same request, including a terminal acknowledgement. Progress
requires an ID and state installing, confirming, succeeded or failed. Only failed
accepts a nonnull error: update_failed, update_repair_required,
update_scope_changed or update_expired. IDs above are placeholders for valid UUIDs.
The maximum body is 4096 bytes; unknown fields and invalid combinations fail closed.

The reply has schema_version, host_id, agent_id, generation,
`capability: "agent_update_requests.v1"`, and request null or:

```json
{
  "id": "request-uuid",
  "state": "queued",
  "error": null,
  "expires_at": "2026-10-24T18:00:00.000Z",
  "candidate": {"manifest": "exact signed JSON bytes", "signature": "base64 signature"}
}
```

Active states are queued/installing/confirming; terminal states succeeded/failed.
Progress cannot regress confirming to installing. Exact terminal acknowledgements
return the terminal record. Polling does not update credential contact or skill
freshness. Requests expire after 24 hours. Archive/delete, generation replacement,
revocation or loss of requester authority fences further delivery and cancels
outstanding intent. A new credential cannot receive a previous generation's job.
Access locks precede host locks, then request/item locks, serializing revocation.

Success requires the update to have started and an accepted platform report at or
after that start, from the same agent/generation, with exact target running and
installed versions and signed binary/runtime/descriptor hashes. The root updater
also checks the fresh report and actual service process executable. Enqueue,
download and successful service start are insufficient. Per-target Fleet progress
remains pending until this confirmation or a terminal failure.

## Local execution and recovery

The root update timer uses `update --poll`, every minute plus 0–20 seconds jitter,
starting after two minutes. It shares the existing installation lock. A poll first
retries a saved request/result; if no request exists it runs ordinary automatic
work, preserving its 20-hour check guard and app/local policy. An explicit Update
now request is manual, so automatic settings and release automatic eligibility do
not disable it. Signature, platform, compatibility, capability and downgrade
checks always apply.

Before installation the root updater writes exact request identity and target in
`updater/private/remote-request.json` with 0600 permissions. It persists terminal
results before acknowledging them. Network failure retries that result without
reinstalling. The normal signed download/staging, second authority recheck before
stopping monitoring, transaction journal and atomic switch are reused. No daemon
root IPC is added. Identity, counters, queues and SDK assets retain their contracts.

An awaiting-confirmation transaction resumes confirmation; staged/switching or
repair-attempted transactions require manual repair and are never blindly replayed.
An expired/cancelled request cannot start installation. If the release has already
switched, local process confirmation can safely finish its transaction without
changing the app's terminal cancellation/expiry result. Do not delete the request,
transaction or identity files as a retry mechanism. Preserve them and use the
[normal repair procedure](../operating/agents.md#failure-replacement-and-removal).


## Package-maintenance exclusion

Signed agent replacement and typed host maintenance share the same app host order
and root mutation lock. Active workers, inherited locks, unresolved journals and
pending recovery delivery block replacement, repair, rollback and uninstall. Do
not use an update to discard uncertain package state. An old signed updater can
install a compatible release containing added maintenance templates; its new
verified poller bootstraps that complete set. Normal updates preserve an already
initialized administrator-disabled maintenance timer. Removing unsupported units
on rollback requires proof that no package worker is active. See
[maintenance contracts](maintenance-actions.md) for root lifetime and reconciliation.
