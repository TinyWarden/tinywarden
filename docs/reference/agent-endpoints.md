# Host-agent HTTP endpoint index

This is the complete endpoint set called by the host agent, including its
monitoring and action lanes. The agent connects outbound; it exposes no inbound HTTP
server or remote shell. Skill code uses the [Python SDK](skills/sdk.md), not these
credentials or transport calls. Route versions and JSON schema versions are separate.

Unless a row says otherwise, authentication uses the enrolled agent bearer
credential and validates host, agent and credential generation. Operator cookie
APIs are documented separately in [Fleet](fleet-management.md) and
[skill action permissions](skills/actions.md#app-endpoints).

## Enrollment and host control

| Method and path | Purpose and owning contract |
| --- | --- |
| `POST /api/v1/agent/setup` | Before installation, use the enrollment token from the decoded setup code to read app capabilities. Does not enroll the host or consume the token. [Setup](agent-protocol.md#setup-capability-check) |
| `POST /api/v1/agent/enroll` | Enroll or replay the original enrollment with the one-time enrollment token and persisted pending credential. [Enrollment](agent-protocol.md#transport-and-enrollment) |
| `POST /api/v1/agent/heartbeat` | Send durable contact sequence/version evidence. [Heartbeat](agent-protocol.md#heartbeat-and-contact) |
| `POST /api/v1/agent/monitoring-control` | Negotiate and acknowledge Fleet pause/resume epochs. [Fleet control](agent-protocol.md#fleet-control-and-managed-reconnection) |
| `POST /api/v1/agent/reconnect-intent` | Inspect the intended host/generation using the replacement setup token before consuming it. [Reconnection](agent-protocol.md#fleet-control-and-managed-reconnection) |

## Managed installation and updates

| Method and path | Purpose and owning contract |
| --- | --- |
| `POST /api/v1/agent/update-policy` | Read effective automatic-update policy, capabilities, signed release candidate and latest platform evidence. [Policy](agent-protocol.md#update-policy) |
| `POST /api/v1/agent/platform-status` | Report running/installed release identity and updater/worker readiness. [Status](agent-protocol.md#platform-status) |
| `POST /api/v1/agent/update-requests` | Poll or acknowledge an explicitly requested, signed agent update. [Update requests](agent-updates.md#root-updater-endpoint) |

## Monitoring packages

| Method and path | Purpose and owning contract |
| --- | --- |
| `POST /api/v2/agent/skill-assignments` | Fetch leased package assignments and negotiated SDK support. [Package lane](agent-protocol.md#generic-package-lane) |
| `GET /api/v2/agent/skill-packages/{assignment_id}` | Download that assignment's exact admitted ZIP. [Package lane](agent-protocol.md#generic-package-lane) |
| `POST /api/v2/agent/skill-runs` | Submit durable observation/resource results with original receipt identity. [Package lane](agent-protocol.md#generic-package-lane) |
| `POST /api/v2/agent/skill-run-starts` | Claim an authorized manual collection start. [Manual requests](agent-protocol.md#manual-requests) |

## Independently delivered actions and recovery

| Method and path | Purpose and owning contract |
| --- | --- |
| `POST /api/v1/agent/maintenance-jobs` | Poll generic action jobs and submit bound sequenced events using schema 2. [Action transport](skills/actions.md#app-endpoints) |
| `GET /api/v1/agent/maintenance-jobs/{id}/package` | Download the job's pinned package with exact archive/content identity. [Action transport](skills/actions.md#app-endpoints) |
| `POST /api/v1/maintenance-recovery/describe` | Read recovery scope with its separate recovery bearer token. [Recovery](skills/actions.md#recovery-http-calls) |
| `POST /api/v1/maintenance-recovery/accept` | Submit lock-held inspection evidence under that recovery authorization. [Recovery](skills/actions.md#recovery-http-calls) |
| `POST /api/v1/maintenance-recovery/finalize` | Confirm the matching local release after app acceptance. [Recovery](skills/actions.md#recovery-http-calls) |

The implementation owners are the agent's
[control plane](https://github.com/TinyWarden/tinywarden-agent/tree/main/internal/controlplane),
[package worker](https://github.com/TinyWarden/tinywarden-agent/tree/main/internal/agent),
[installation](https://github.com/TinyWarden/tinywarden-agent/tree/main/internal/installation),
[maintenance transport](https://github.com/TinyWarden/tinywarden-agent/tree/main/internal/maintenance).
The application's route adapters live under [agent v1](../../app/api/v1/agent),
[agent v2](../../app/api/v2/agent) and [recovery](../../app/api/v1/maintenance-recovery).
