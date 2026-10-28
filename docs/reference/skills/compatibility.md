# Skill compatibility

Package protocol, display format and host-agent release are separate versions.
SDK versions 1–3 use `python-3.13-v1`. Check the installed runtime's capabilities as well as
the manifest and host OS/architecture; a declaration cannot make an unsupported
operation available.

| Feature | Requirement |
| --- | --- |
| SDK 1 assessment | Package format/sdk 1 and compatible trusted Python runtime |
| SDK 2 discovery/subjects | Package format/sdk 2, resource-capable app and managed agent 0.0.11+ |
| SDK 3 monitoring | Published SDK format/sdk 3 support and `skill_packages.sdk3.v1`; use managed agent 0.0.22+ with a compatible app. Selection waits for the affected active/paused hosts to support it |
| Independently delivered actions | Managed agent 0.0.22+, compatible app, format/sdk 3, `skill_actions.v1`, exact package/action permission and local publisher/class policy; see [actions](actions.md). A monitoring grant never authorizes execution |
| Explicit action verification policy | The optional `verification` field requires managed agent 0.0.24+ and matching app SDK validators. Activation and assignments withhold it from older agents; omitting the field preserves previous SDK3 behavior. See [choosing verification](actions.md#choosing-verification) |
| Prompt action delivery | Agent 0.0.24+ with the bounded work-wait app endpoint; older apps/agents retain polling. The wake-up hint grants no authority |
| Run now | App support and host feature `skill_runs.manual.v1` (agent 0.0.5+) |
| Clock-tolerant manual starts | Agent 0.0.12 fixes a small app clock lead with five-second tolerance, retaining the local 90-second limit |
| Coherent evaluation clock | App supplies `now >= captured_at` and `now >= received_at` for all monitoring SDK versions; existing packages and runtimes work unchanged. Updated author tools mirror this in captured cases; older pinned tools keep their original fixture behavior |
| Display format 2, dashboard and newer descriptor options | Matching trusted app/host SDK asset validators; old validators may reject new keys |
| Optional file reads/helpers | Updated trusted SDK assets implementing those request/grant additions |

Agent 0.0.22 requires the app capabilities `skill_actions.v1` and
`skill_packages.sdk3.v1`, in addition to the existing update capabilities. Both
automatic and explicitly requested updates refuse a release when the app lacks a
required capability. Older signed releases retain their original requirements.

SDK 3 first shipped with agent 0.0.21; use 0.0.22 or later for the corrected managed
action startup and idle polling. Agent 0.0.20 cannot run SDK 3 packages. The SDK
bytes pinned by the official skills repository are unchanged by the 0.0.22 repair.

The verified managed platform is Debian 13 amd64. Some schema values also accept
arm64; that acceptance does not claim a published/tested managed arm64 release.
The official skills repository pins its public SDK in
[SDK.lock.json](https://github.com/TinyWarden/tinywarden-skills/blob/main/SDK.lock.json).
Use that exact archive/file set for reproducible authoring; SDK source changes do
not advertise a released capability.

SDK source folders are implementation details, not import APIs for skill code.
Skills implement the documented entry points and use the supplied host interface.
The SDK author command remains `sdk/python/skill_tool.py`; trusted runtime assets
are pinned as a complete set. Reorganizing these internals does not change package
format/sdk numbers, installed entry points or existing package content identities.

Old agents retain SDK 1 delivery; they do not run SDK 2 by discarding resource fields.
Updating descriptor metadata does not migrate old observations. Version selection
requires compatible settings schemas and exact-digest access approval, preserves
settings/overrides/history and resets reduction/assignment scope.

For a standalone package using existing supported features, distribution is a skill
release only. New host capabilities or changed validators require their platform
release and asset integration first. Preserve all existing SDK locks, runtime asset
hashes and published ZIP identities during unrelated documentation changes.

## Canonical identities and runtime files

Agent 0.0.23 and its SDK use canonical `namespace/slug` subjects throughout and
reject the obsolete `alias` manifest field. Official packages with that field need
a new package version with the field removed; collector/action code can stay the
same. Use the canonical-ID releases of Disk space, Updates, Reboot status and Trim
with this platform. A package without an alias can also run on an earlier compatible
SDK, subject to its declared capabilities.

General exact-file access under `/run` requires the SDK distributed with agent
0.0.23 or later. Older SDKs only permit their fixed runtime-file allowlist. The
new policy retains explicit grants, regular-file/no-follow access and protected
credential/platform paths; it does not grant recursive runtime access.
