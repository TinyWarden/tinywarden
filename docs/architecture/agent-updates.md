# Agent installation and maintenance

The agent is published separately in `TinyWarden/tinywarden-agent`. A managed
release includes the executable, trusted Python runtime and service templates as
one versioned platform. Initial support is Debian 13 amd64.

## Operator controls

**Add server** creates an existing single-use, 15-minute enrollment token wrapped
with the configured HTTPS app origin in `tw_setup_v1.` plus canonical unpadded
base64url UTF-8 JSON `{origin, token}`. The origin is server configuration, never a
request Host header. This is encoding, not encryption. The entire code is secret;
do not place it in URLs, command arguments or logs. An uncertain token response
is retried with the same request ID; if its secret was already delivered, revoke
that token and create another rather than fabricating a second enrollment.

General **Settings** at `/preferences` controls default automatic updates. A
server's **Agent** card can inherit this default or explicitly choose On/Off.
Changes use revision comparison and an idempotent request ID; explicit choices
survive future default changes. Root can prohibit automatic updates locally;
app settings cannot override this. There is no remote root command endpoint.

Maintenance badges beside server names report update availability or failure.
They do not change server health, alert counts, disk/reboot state or skill results.
Manual installations, stale information and failed verification remain explicit;
an unknown catalogue never implies that software is current.

## Authenticated protocol

All agent endpoints use the existing Bearer credential authorization and generation.
They are separate from the immutable heartbeat/replay and skill-report protocol.

| Endpoint | Purpose | JSON body limit |
| --- | --- | --- |
| `POST /api/v1/agent/setup` | Check an unconsumed enrollment token and app capabilities; consume nothing | 2 KiB |
| `POST /api/v1/agent/update-policy` | Direct fresh policy bound to host, agent and credential generation | 4 KiB |
| `POST /api/v1/agent/platform-status` | One ordered latest executable/runtime/update observation | 8 KiB |

Setup requests contain only `schema_version: 1`. Policy requests contain schema,
host/agent IDs, credential generation, numeric platform version and managed flag.
Responses expire after five minutes and include effective policy revisions,
supported capabilities, report watermark, exact signed candidate manifest/signature,
and latest process identity for confirmation. Replies are bounded to 32 KiB.

Status requests add an independent monotonic sequence, observation timestamp and
closed platform observation: version, managed flag, executable/runtime/descriptor
hashes, installed version, local automatic policy and a closed updater outcome.
Only fixed diagnostic codes are accepted; no paths, commands, raw errors or secrets.
Older sequences are ignored, generations are isolated, and only one latest row per
agent is kept. Polling produces no audit event and never updates host contact.

The monitoring process sends this optional report independently of pending/frozen
heartbeats. The root updater reads a bounded no-follow credential file, requests
policy directly, verifies signed releases and rechecks policy after staging. It
never trusts an agent-written update approval and never loads skill code.

## Catalogue and deployment

Migration 023 adds release metadata, latest catalogue state, shared defaults,
nullable host overrides and latest platform reports. `tinywarden-agent-catalog`
is a separate six-hour native job. GitHub network access happens before database
transactions. At most 100 release entries are discovered and 16 new manifests are
verified per invocation; manifests are limited to 16 KiB and signatures to 256 bytes.
Automatic eligibility needs verified catalogue information no older than 24 hours.
Fixed repository, exact Ed25519 signature, closed manifest fields, numeric version,
platform, source range and app capabilities are all checked.

Deploy the app/schema and compatible fixed jobs before adopting an agent. The
installer checks dependencies and app capabilities before consuming a setup token.
It supports a chosen persistent installation directory and leaves dependencies to
the administrator. See the [agent installation guide](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/deploy/managed.md).

Uninstall either stops/disables local services while keeping state, or purges the
local installation. **Both leave the server and its existing history in the app**;
ordinary configured retention still applies. App deletion is a separate action.
