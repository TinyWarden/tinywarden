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
Under `/run`, only exact reboot-required and reboot-required.pkgs files are allowed.
Home, root, device/sys directories and credential/state/runtime paths are protected.

`optional:true` returns `available:false` with `not_found`, `unreadable` or
`invalid_encoding` for ordinary supplementary-data failure. Success has
`available:true`, `text` and `truncated`. It is a request flag, not a capability
field, and does not relax path/grant/worker/resource failures.

## Systemd and commands

`systemd.properties` declares unit names as an array and fixed property names.
It cannot read arbitrary environment, unit source or logs. The SDK 2 service grants
are exactly `{"operation":"systemd.services.list"}` and the corresponding read
operation. Both are observation-only; no start/stop/restart verb exists.

Command grants name an executable under `/usr/bin` or `/usr/sbin`, fixed argv
alternatives, bounded argument slots, read-only inputs and a 1–30 second timeout.
They are not a shell. Helpers may name individual approved binaries under those
paths or `/usr/lib`; trusted owner/mode and library checks still apply. Every
helper/empty directory must remain inside the same permission intersection.

Use the [grant validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/grants.py)
for exact field syntax and property names. A supported operation is a platform
capability, not arbitrary Python access to the host. New capabilities need reviewed
SDK, sandbox and compatibility work before packages can use them.
