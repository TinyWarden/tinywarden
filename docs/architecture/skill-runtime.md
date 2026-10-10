# Skill runtime and host access

Status: enforced SDK v1 boundary implemented for Python directories and ZIP upload.
The compiled compatibility runner does not isolate community code.
No custom package can execute until these controls pass
under the actual service identity. [Platform](skill-platform.md) and
[package](skill-packages.md) contracts own behavior and distribution.

## Trust boundary

Treat package code, metadata and normalized results as untrusted. It may lie about
health or misuse approved observations. Admission and sandboxing do not certify
the quality of a community skill. An administrator's installation approval grants
specific host reads, never access to core credentials or unrestricted host actions.

Use distro-maintained CPython 3.13, bubblewrap and libseccomp on Debian 13. Pin the
TinyWarden SDK/protocol, keep distro security updates, and verify readiness rather
than accepting only the presence of a binary. No bundled interpreter downloaded
on first run. WebAssembly is a possible future runtime, not a second initial one.

Python's isolated flags reduce accidental environment coupling; they do not create
a sandbox. Bubblewrap supplies namespace/mount mechanisms; TinyWarden must supply
and verify its security policy. These are kernel/process boundaries, not a claim
of virtual-machine isolation from a compromised host or kernel.

## Each execution

- Start a child with no inherited credentials, environment, working directory,
  open database/network files or sockets. Keep only bounded input/output and the
  collector's dedicated broker channel. Launch Python with `-I -S -B`; a trusted
  launcher explicitly loads read-only SDK and package paths.
- Require user, mount, PID, IPC, UTS, network and cgroup namespaces, an empty root,
  read-only runtime/package mounts, private minimal `/dev`, private `/proc` and a
  size-limited temporary filesystem. Explicit namespace flags are required; no
  `*-try` fallback. No host `/home`, `/root`, `/run`, `/var`, process namespace,
  cgroup filesystem, service socket or agent configuration/state is mounted.
- Drop capabilities, set no-new-privileges, prohibit nested user namespaces and
  install a versioned architecture-specific seccomp allowlist before package code.
  Deny mount/namespace manipulation, ptrace, process-memory access, kernel modules,
  BPF/performance interfaces, raw devices and direct networking. Close unexpected
  descriptors. Missing or rejected policy means unavailable, never unsandboxed.
- Supervise an isolated cgroup v2 subtree with memory, PID and CPU limits, no swap
  allowance, bounded scratch/output and a monotonic wall deadline. Put every child
  in that subtree before executing untrusted code; kill/reap the whole subtree on
  completion or failure. A process-group kill or per-UID rlimit alone is insufficient.
- Use required delegated `cpu`, `memory` and `pids` controllers in the existing
  native units, with the supervisor in its own leaf. Verify write/enforcement
  access under the actual service UID. Package code cannot access the cgroup mount.
  Missing delegation/controller support blocks custom execution, not heartbeat.

Core app/agent processes do not import package modules. Pure validation/reduction/
evaluation has no host broker. Supervision stays inside the existing app, agent and
bounded native-job architecture; no root daemon or second web deployment is added.
Native job artifacts pin every launcher/SDK/policy asset they use.

## Host observation SDK v1

Collector code uses `host.request(operation, arguments)`. Calls cross a bounded,
authenticated-by-possession pipe belonging to that execution, not an exposed TCP
service. The trusted broker combines manifest requests, administrator-approved
digest grants and the agent's local ceiling. Every call must satisfy all three.
No package-supplied shell fragment, dynamic library or unrestricted RPC is accepted.

| Operation | Contract |
| --- | --- |
| `files.read`, `files.stat`, `files.list` | Declared exact paths or bounded directory roots; bounded bytes/entries; no symlink/magic-link escape or special devices. Read-only. |
| `filesystems.snapshot` | Trusted host-view local mount metadata and capacity; preserves existing exclusions. Does not measure sandbox mounts. |
| `systemd.properties` | Declared unit names/property names; broker invokes read-only property queries, never exposes the bus or unit actions. |
| `command.capture` | Declared root-owned system executable, argv alternatives or bounded typed argument slots, and explicit read-only input mounts. Runs in its own constrained sandbox under the collector budget. |

File access uses descriptor-relative confinement and rejects traversal/race/symlink
escapes. Host pseudo-files require explicit broker handling; v1 permits bounded
reads of `/proc/meminfo`, `/proc/loadavg`, `/proc/stat` and `/proc/uptime`, not arbitrary
process environments, memory or descriptors. The exact kernel `boot_id` file is
also readable for confirming a consistent trim snapshot. Credentials, agent/app storage and
private configuration remain denied even if a manifest asks for them. Broad host
roots and credential directories cannot be approved. Distinct legitimate host
paths/units/executables are data in grants, not new compiled profiles per skill.

Under `/run`, file operations support only exact `/run/reboot-required` and
`/run/reboot-required.pkgs` paths. Directory roots and other `/run` paths are
denied. A `files.read` request may include boolean `optional:true` for supplementary
evidence. It returns `available:true` with `text`/`truncated`, or `available:false`
with fixed `not_found`, `unreadable` or `invalid_encoding` reasons for ordinary file
absence/read/UTF-8 failures. Omitted or false preserves the original response and
failure contract. The flag is rejected on stat/list and in manifest grants.
Capability denials, protected paths, links/special files, worker failures and
execution/resource/output limits remain fatal. Every optional read still requires
all three permission layers. Deploy the matching trusted SDK artifact first;
see the [SDK file API](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/sdk-v1.md#host-api).

Native commands use no shell string, inherited environment, writable host mount,
host socket/network/device, sudo or host root identity. Grants cannot authorize a
plain unsandboxed subprocess. Read-only APT simulation inputs must preserve current
package semantics without exposing authentication files or changing package state.
Actual filesystem observations use the broker because mount isolation deliberately
hides the host. The broker's own reads/commands are deadline-bound supervised work;
blocking special files, mounts or systemd must not hang core transport.

`command.capture` can additionally declare root-owned `helpers` (system executables
and their distro library dependencies) and `empty_directories` (private empty paths,
never host configuration). Calls must request subsets of the same digest-approved
sets. Helpers name exact binaries under `/usr/bin`, `/usr/sbin` or `/usr/lib`;
the main executable remains under `/usr/bin` or `/usr/sbin`. Runtime checks
require root-owned files and parent directories without group/world write access.
Only declared binaries and their distro library dependencies are mounted.
Root-owned distro `/lib` and related `/usr` aliases are recreated inside the
private root, without mounting extra host directories. APT requests dpkg, its
architecture tables, mirror source lists and the required method helpers, with
an empty apt.conf.d; host hooks and authentication are absent. This is declarative SDK data, with the
same namespace/seccomp/budget boundary, not an executable-specific compiled profile.

Direct network access, secrets, privileged observations and maintenance actions are
outside SDK v1. A skill requiring these is incompatible, not silently given more
authority. Future platform capabilities are separate from ordinary new packages
using the existing general file/command/systemd/filesystem interface.

## Budgets and failure

| Budget | Collector, including broker/command work | Each pure app invocation |
| --- | --- | --- |
| Wall time | Up to 60 seconds; existing skill limits preserved if lower | 5 seconds |
| Aggregate CPU time / CPU quota | 15 seconds / one CPU | 2 seconds / one CPU |
| Memory, swap | 256 MiB, zero swap | 128 MiB, zero swap |
| Processes/threads | 32 | 16 |
| Private scratch | 8 MiB total across nested work | 8 MiB |
| JSON input/output | 1 MiB each | 1 MiB each |
| Broker calls / raw reads | 64 calls; 64 KiB per file read, 256 KiB raw total | No broker |
| Command stdout / stderr | 64 KiB / 16 KiB per command within raw total | No broker |
| State | No durable guest writes | 16 KiB validated state |

These are ceilings, not guaranteed allocations; manifest requests can lower them.
Use cgroup accounting for aggregate CPU and memory, not only a single child limit.
App sandbox concurrency is two, queue length 32 with a bounded queue wait; reject
excess work retryably. Agent execution uses one shared skill slot and fair due
scheduling independent of priority heartbeat and bounded durable delivery queues.
Broker work counts against the originating invocation, including child processes.
Typed broker snapshots share the 1 MiB JSON bound; the filesystem broker retains
the existing 4 MiB mount-info parse bound and 128-mount limit with explicit overflow.

Timeout, resource exhaustion, malformed output, denied capability and runtime
unavailability produce distinct engine-owned unknown/unavailable reasons. They
cannot fabricate a clean result or recovery. Keep prior readings as historical
facts without extending freshness. Diagnostics exclude raw output/secrets and are
bounded; retained error codes are safe to show in UI/history. Failure cleanup must
finish before reusing a slot; otherwise pause that execution lane visibly.

## Required conformance before enabling packages

The trusted supervisor bounds the complete response envelope, including digest
and newline. Oversized results return `output_exceeded` after cleanup; they cannot
masquerade as failed isolation cleanup or pause unrelated interpretation work.
The agent also bounds the complete durable upload body and replaces an oversized
observation with that failure under the same run identity before persisting it.

Admission uses a parent-owned temporary workspace and an inherited exclusive
store lock. Partial extraction, publication and canonical ZIP files are removed
after child exit, including forced termination. The next admission reclaims
orphans only after acquiring the lock. Successfully published content remains
immutable and counts against the existing store quota.

Systemd grants use explicit arrays of unit names; object-shaped scopes and names
starting with a dash are rejected. The broker separates options from unit operands
with `--`. Installed invalid scopes cannot be enabled or delivered for execution.

Verify missing-isolation rejection and attempts to read core credentials, write the
host, reach host sockets/network/processes, escape through paths/descriptors,
exhaust resources, fork surviving children or exceed broker grants. Prove cleanup
and heartbeat under failure. Use the actual service UID, cgroup delegation and
immutable release assets on a disposable supported host. A namespace smoke probe
alone is not acceptance. Exercise existing APT/disk/trim behavior inside the chosen
boundaries, then the independent fifth-skill proof. These checks belong to runtime
implementation acceptance, not repeated execution for every ordinary UI edit.

References: [Python invocation](https://docs.python.org/3.13/using/cmdline.html),
[bubblewrap policy boundary](https://github.com/containers/bubblewrap),
[Debian bubblewrap manual](https://manpages.debian.org/trixie/bubblewrap/bwrap.1.en.html),
[systemd resource control](https://manpages.debian.org/trixie/systemd/systemd.resource-control.5.en.html),
[WebAssembly security model](https://webassembly.org/docs/security/).
