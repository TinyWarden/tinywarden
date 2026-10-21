# Skill compatibility

Package protocol, display format and host-agent release are separate versions.
Both SDKs use `python-3.13-v1`. Check the installed runtime's capabilities as well as
the manifest and host OS/architecture; a declaration cannot make an unsupported
operation available.

| Feature | Requirement |
| --- | --- |
| SDK 1 assessment | Package format/sdk 1 and compatible trusted Python runtime |
| SDK 2 discovery/subjects | Package format/sdk 2, resource-capable app and managed agent 0.0.11+ |
| Run now | App support and host feature `skill_runs.manual.v1` (agent 0.0.5+) |
| Clock-tolerant manual starts | Agent 0.0.12 fixes a small app clock lead with five-second tolerance, retaining the local 90-second limit |
| Display format 2, dashboard and newer descriptor options | Matching trusted app/host SDK asset validators; old validators may reject new keys |
| Optional file reads/helpers | Updated trusted SDK assets implementing those request/grant additions |

The verified managed platform is Debian 13 amd64. Some schema values also accept
arm64; that acceptance does not claim a published/tested managed arm64 release.
The official skills repository pins its public SDK in
[SDK.lock.json](https://github.com/TinyWarden/tinywarden-skills/blob/main/SDK.lock.json).
Use that exact archive/file set for reproducible authoring; SDK source changes do
not advertise a released capability.

Old agents retain SDK 1 delivery; they do not run SDK 2 by discarding resource fields.
Updating descriptor metadata does not migrate old observations. Version selection
requires compatible settings schemas and exact-digest access approval, preserves
settings/overrides/history and resets reduction/assignment scope.

For a standalone package using existing supported features, distribution is a skill
release only. New host capabilities or changed validators require their platform
release and asset integration first. Preserve all existing SDK locks, runtime asset
hashes and published ZIP identities during unrelated documentation changes.
