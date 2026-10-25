# Host access for skills

Every request must be allowed by the package declaration, the administrator's
approval for that exact digest, and the local host-agent ceiling. OS permissions
also apply. Updating a package or agent cannot widen an explicit local ceiling.
No host request exposes agent credentials, ambient environment or network access.

Only collect receives a broker. Use exact paths/operands and the least access
needed. A rejected request fails collection even when package code catches it.

| Operation | Request and result |
| --- | --- |
| `files.read` | `path`, bounded `max_bytes`, optional boolean `optional`; returns UTF-8 text/truncated or explicit optional unavailability |
| `files.stat` | Exact `path`; returns exists and size when present |
| `files.list` | `path`, bounded `max_entries`; sorted names and truncation |
| `filesystems.snapshot` | Empty arguments; normalized mount observation through a trusted helper |
| `systemd.properties` | Declared `unit` and `properties`; bounded property strings |
| `command.capture` | Fixed executable, approved argv alternative/inputs and optional approved helpers/empty directories; bounded stdout, exit code and stderr byte count |
| `systemd.services.list` | SDK 2 read-only system-service discovery, empty arguments |
| `systemd.services.read` | SDK 2 read of at most 64 exact unique `.service` names |

All operations above are also available to SDK 3 monitoring with the corresponding
grants. SDK 1 cannot declare the two `systemd.services.*` operations. They are
observation calls, not the independently authorized action interface.

## Exact request and result shapes

Use `host.request(OPERATION, ARGUMENTS)`. The caller supplies arguments only; the
runtime adds trusted execution context. Errors fail collection rather than returning
an empty success. Fields below describe successful results unless stated otherwise.

| Operation | Arguments | Result |
| --- | --- | --- |
| `files.read` | `path`; optional `max_bytes` (default 65536), `optional` (default false) | `{text, truncated}`. With `optional:true`, success adds `available:true`; ordinary missing/unreadable/invalid-encoding failure returns `{available:false, reason}` |
| `files.stat` | `path` | `{exists:false}` for an absent path; otherwise `{exists:true, size}` with size capped at the JSON safe-integer maximum |
| `files.list` | `path`; optional `max_entries` (default 128) | `{entries:[names...], truncated}`; names sorted before truncation |
| `filesystems.snapshot` | `{}` | Filesystem envelope described below |
| `systemd.properties` | `{unit, properties:[names...]}` | Object mapping each requested property name to its string value; no extra or missing keys |
| `command.capture` | `{executable, argv:[strings...], inputs:[paths...]}`; optional `helpers` and `empty_directories` arrays | `{exit_code, stdout, stderr_bytes}`; UTF-8 stdout and the stderr byte count, never stderr content |
| `systemd.services.list` | `{}` | `{boot_id, uptime_ms, complete, reason, items}` |
| `systemd.services.read` | `{units:[names...]}`; unique, at most 64, empty allowed | `{boot_id, uptime_ms, items}` for the explicitly requested units |

Read/list limits must be positive and no larger than their grant limit. A directory
scan over 4096 entries or a name longer than 255 characters fails its budget.
`files.read` uses strict UTF-8, so a byte limit splitting a character can fail
decoding. Optional reads do not catch permission-policy or resource-budget failures.

### Filesystem envelope

`filesystems.snapshot` returns `{coverage, reason, excluded_kernel,
excluded_remote, mounts}`. Coverage is `complete` or `incomplete`; `reason` is
`none` when no collection problem was found. Each mount contains `mount_id`,
`mount_path`, `mount_root`, `filesystem_type`, `kind`, `writable`, `shared_capacity`,
`reason`, `total_bytes`, `free_bytes` and `available_bytes`. Quantities are nullable
decimal strings. Kind is `local` or `unsupported`; measurement success uses
`reason:"none"`. The helper returns raw capacity evidence, not health thresholds.

This operation observes supported local filesystems, excludes kernel and known
remote mounts, and reports unsupported types explicitly. It is not a complete
remote-filesystem inventory. It bounds mount metadata to 4 MiB/4096 entries and
output to 128 mount rows, sorted by mount ID. Read failure, malformed/changed
topology, unsupported type, inaccessible/disappeared mounts and output overflow
remain explicit incomplete evidence. Shared capacity must not be summed twice.

### Service envelopes

Both service operations return a boot UUID and uptime in milliseconds. Each item
contains `{requested, available, reason, properties}`. Available items have a null
reason and these string properties: `Id`, `Names`, `Description`, `LoadState`,
`ActiveState`, `SubState`, `UnitFileState`, `Type`, `RemainAfterExit`, `TriggeredBy`,
`Result`, `ExecMainCode`, `ExecMainStatus`. Description is shortened to 256 UTF-8
bytes. The properties remain observations; the skill decides monitoring eligibility
and health. Bare templates return unavailable with reason `template`; unreadable
selected units return unavailable with reason `unreadable` and empty properties.

Discovery combines installed unit files and loaded system services, deduplicates
canonical IDs, limits names to 512 and retained available rows to a 240 KiB budget.
Its reason is null when complete, otherwise `limit` or `unavailable`. Discovery
may omit unreadable units and return incomplete coverage. Read selected units
separately; missing discovery evidence is not proof of a healthy or absent service.

## File grants

Declare exact `paths` and narrow directory `roots`. Reads cap at 65536 bytes and
lists at 128 entries. Example:

```json
{"operation":"files.read","paths":["/proc/meminfo"],"roots":[],"max_bytes":16384}
```

```python
result = host.request("files.read", {"path": "/proc/meminfo", "max_bytes": 16384})
if result["truncated"]:
    raise ValueError("incomplete_observation")
```

Links, special files and protected paths are denied. `/proc` supports only the
fixed whitelist: meminfo, loadavg, stat, uptime and sys/kernel/random/boot_id.
Under `/run`, grants may name exact files, including files inside a service's
runtime directory. Recursive runtime roots and directory listing are denied.
Reads/stat require regular files and reject symlinks in every path component,
FIFOs, sockets, devices and directories. Package declaration, administrator
approval and the local ceiling must each authorize the exact request.
Home, root, device/sys directories and platform state remain protected. Runtime
credential directories (`/run/credentials`, `/run/secrets`, `/run/user`, `/run/sudo`)
and TinyWarden's runtime state are denied even with an explicit grant.

`optional:true` returns `available:false` with `not_found`, `unreadable` or
`invalid_encoding` for ordinary supplementary-data failure. Success has
`available:true`, `text` and `truncated`. It is a request flag, not a capability
field, and does not relax path/grant/worker/resource failures.

## Systemd and commands

Trusted command helpers and isolated skill/command processes use `TZ=UTC` and
`LANG=LC_ALL=C.UTF-8`; operator environment variables and credentials are not
inherited. This stabilizes textual dates independently of the host's timezone,
locale and daylight-saving transitions. The SDK does not change host settings.

`systemd.properties` requests Unix timestamp formatting. Systemd may still render
derived timer properties such as `LastTriggerUSec` and `NextElapseUSecRealtime` as
text; those dates are in UTC. Callers can accept `@seconds[.fraction]` or canonical
UTC text without parsing local timezone abbreviations. Empty timestamps remain
empty: a timer trigger or default service `Result=success` does not prove a
completed service execution. UTC formatting does not relax evidence ordering,
freshness, transport deadlines or the separate evaluation clock contract.

`systemd.properties` declares unit names as an array and fixed property names.
There are at most 16 `.service`/`.timer` units and 32 requested property entries.
The allowed properties are `Id`, `LoadState`, `ActiveState`, `UnitFileState`,
`LastTriggerUSec`, `NextElapseUSecRealtime`, `ConditionResult`, `ConditionTimestamp`,
`Result`, `ExecMainCode`, `ExecMainStatus`, `ExecMainStartTimestamp`,
`ExecMainExitTimestamp`, `SubState` and `Description`. Returned values are at most
512 characters with no control characters. This allowlist excludes sensitive unit
configuration; declaring an unsupported property cannot grant access to it.
It cannot read arbitrary environment, unit source or logs. The SDK 2 service grants
are exactly `{"operation":"systemd.services.list"}` and the corresponding read
operation. Both are observation-only; no start/stop/restart verb exists.

Command grants name an executable under `/usr/bin` or `/usr/sbin`, fixed argv
alternatives, bounded argument slots, read-only inputs and a 1–30 second timeout.
They are not a shell. Helpers may name individual approved binaries under those
paths or `/usr/lib`; trusted owner/mode and library checks still apply. Every
helper/empty directory must remain inside the same permission intersection.

File grants require `operation`, `paths` and `roots`; each path array has at most
32 entries. Optional `max_bytes` and `max_entries` narrow the read/list limits.
Command grants require `operation`, `executable`, `argv`, `inputs` and
`timeout_seconds`; `helpers` and `empty_directories` are optional. There are at
most 16 argv alternatives of at most 32 slots and 16 entries in each path/helper
array. A slot is an exact string, `{type:"integer", minimum, maximum}` bounded
within -1000000..1000000, or `{type:"enum"|"path", values:[...]}` with at most
32 values. Requests provide strings matching one complete approved alternative;
they do not submit a shell string or runtime timeout override. Captured stdout is
limited to 65536 bytes and stderr to 16384 bytes; both count toward broker IO use.

Use the [grant validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/contracts/grants.py)
for exact field syntax and property names. A supported operation is a platform
capability, not arbitrary Python access to the host. New capabilities need reviewed
SDK, sandbox and compatibility work before packages can use them.


## Package observation versus maintenance

Monitoring host operations remain bounded read-only observations, including cached
package-plan evidence. They cannot refresh APT indexes, install packages or gain
root execution through an SDK permission. Administrative package work belongs to
separately authorized [skill actions](actions.md), with domain code in the skill
and generic supervision in the agent. A new
monitoring skill needs no maintenance adapter or agent rebuild.
