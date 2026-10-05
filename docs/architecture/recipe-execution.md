# Bounded observation recipe execution

The agent's compiled runner owns bounded process execution; local normalizers
produce typed evidence for the server. Source and authored examples live in
[tinywarden-agent](https://github.com/TinyWarden/tinywarden-agent).
[Baseline observations](baseline-observations.md) owns interpretation and integration;
[baseline protocol](baseline-protocol.md) owns delivery and results.

## Authority and ownership

The control plane selects centrally versioned recipes. The agent independently
enforces a compiled command policy, `exec_observe.debian13.v1`. Authenticated
delivery cannot extend that policy. Initial support is Debian 13, Linux amd64,
with root-managed system tools and the dedicated unprivileged agent account.
Check local OS/architecture at startup and before recipe admission as well as
server applicability; stored enrollment metadata alone cannot authorize execution
after an OS change.

`internal/runner` owns policy validation, process lifecycle and bounded
execution evidence. It imports no HTTP, database, assignment or credential code.
The agent package owns authenticated assignment admission,
scheduling and queues. baseline normalizers convert bounded command evidence into
typed observations; the server owns health evaluation. CLI dispatch may invoke
one fixed internal supervisor entry point in the current binary. This is a
child of the agent, with no new installed service or independently deployed helper.

The initial policy permits the profiles below only. It contains no generic
interpreter, shell, script, downloaded program, package install/update, reboot,
trim operation, service mutation or sudo command. Root administrators, installed
system binaries/libraries and their root-owned configuration are trusted. The
runner limits centrally supplied instructions; it is not a sandbox for malicious
local binaries or a compromised agent account. Its children share the agent UID.

## Recipe and argument policy version 1

A recipe is a strictly validated object with `schema_version:1`,
`capability:"exec_observe.debian13.v1"`, `policy_version:1`,
`timeout_seconds` integer 1..30 and `steps` containing 1..4 ordered steps.
Each step has exactly `step_id`, `profile` and `argv`; step IDs are unique,
1..32 lowercase ASCII letters/digits/underscore/hyphen. No environment, user,
directory, stdin, executable path, output limit or arbitrary parameter field.
Unknown fields, duplicate JSON keys, embedded NUL and invalid UTF-8 are rejected.
Bound the complete encoded recipe to 8 KiB, each argv to 16 strings and each
string to 512 UTF-8 bytes. Validate the whole recipe before starting any step.

Profile names select fixed executable paths. Arguments are exact arrays; aliases,
reordering, option prefixes, appended operands and extra flags are not equivalent.
The agent never constructs a shell command from them or searches PATH.

| Profile | Executable | Only accepted argv arrays |
| --- | --- | --- |
| `apt-upgrade.v1` | `/usr/bin/apt-get` | `["--simulate","upgrade"]` or `["--simulate","--with-new-pkgs","upgrade"]` |
| `reboot-marker.v1` | `/usr/bin/test` | `["-e","/run/reboot-required"]` |
| `fstrim-timer.v1` | `/usr/bin/systemctl` | `SYSTEMCTL_PREFIX + [TIMER_PROPERTIES,"fstrim.timer"]` below |
| `fstrim-service.v1` | `/usr/bin/systemctl` | `SYSTEMCTL_PREFIX + [SERVICE_PROPERTIES,"fstrim.service"]` below |

`SYSTEMCTL_PREFIX` is the array
`["--system","--no-pager","--no-ask-password","--all","--timestamp=unix","show"]`.
The following are single arguments, with property names in exactly this order:

```text
TIMER_PROPERTIES=--property=Id,LoadState,ActiveState,UnitFileState,LastTriggerUSec,NextElapseUSecRealtime,ConditionResult,ConditionTimestamp
SERVICE_PROPERTIES=--property=Id,LoadState,ActiveState,Result,ExecMainCode,ExecMainStatus,ExecMainStartTimestamp,ExecMainExitTimestamp,ConditionResult,ConditionTimestamp
```

Central changes can choose either APT simulation mode, compose these profiles,
change cadence/timeout within limits or select a supported normalizer/evaluator.
Changing command authority, adding a binary/argument grammar or understanding a
new output format needs a new reviewed agent policy/capability. Changing APT simulation mode must preserve the former definition and historical
interpretation. This is useful bounded
extensibility, not a user-authored command editor.

## Local execution conditions

Before each command, the isolated supervisor revalidates its profile and:

- Requires the spawning thread's real/effective/saved/filesystem UID and GID values to match within
  their respective sets and be nonzero, and permitted,
  effective, inheritable and ambient capability sets to be empty. The deployment
  account remains dedicated, with no added supplementary privileges.
- Requires the selected `/usr/bin` executable and its directory ancestors to
  be root-owned and not group/other-writable. The final executable must be a
  regular native ELF file, executable, without setuid/setgid bits or file
  capabilities. Reject a final symlink or inability to verify ownership/type.
  Normal root package upgrades remain supported; do not pin binary digests.
  Root-controlled replacements are within the trusted-host boundary, not a
  claimed protection against concurrent root compromise.
- Sets/verifies Linux `no_new_privs` on the OS thread that spawns the command.
  In Go, pin that supervisor thread across this setup and process creation.
  Failure prevents launch. Do not change the UID, add capabilities or retry as root.
- Uses `/` as the command working directory, stdin from `/dev/null`, no terminal
  and no inherited descriptors except its explicit standard streams. It passes
  a newly built environment, never `os.Environ()`: `LANG=C`, `LC_ALL=C`, `TZ=UTC`,
  `PATH=/usr/bin:/bin`, `HOME=/nonexistent`, `SYSTEMD_PAGER=cat`,
  `SYSTEMD_COLORS=0` and `SYSTEMD_URLIFY=0`. The runner does not create HOME.
  Descriptor close-on-exec checks precede both supervisor and command creation;
  the command inherits only its explicit standard streams.
  No credential, APT_CONFIG, proxy, loader, pager or DBus-address override is
  inherited from the parent. The parent also gives the supervisor this environment.

Absolute OS tool paths and fixed signal paths are part of this Debian capability,
not instance-specific runtime configuration. Root APT configuration still governs
local package policy; a simulation reflects the accessible local configuration
and lists. Missing tools, inaccessible data or unsupported output stay unknown.

## Process ownership, cancellation and bounds

One recipe runs at a time, with its steps sequential and one monotonic deadline
for the whole recipe. Another request returns `runner_busy` without launching.
The disk disk helper remains separately limited to one helper. Recipe work executes
off the heartbeat scheduling path. There is no queued process per overdue tick
and no catch-up burst after downtime. Cancellation prevents later steps.

Use a fixed same-binary supervisor as the process-group leader for each step.
The actual approved command and ordinary descendants remain in that group. The
supervisor receives only the validated step and remaining budget over a bounded
private pipe, not the agent state or credential. Command stdout and stderr use
separate parent-owned pipes; the supervisor's control response has a separate
4 KiB channel. This separation prevents command output from forging completion.
Frame the request with a fixed four-byte big-endian length (1..8192), followed by
exactly that many JSON bytes. Keep the parent writer open for liveness after the
frame; additional bytes are invalid. Parse only the framed bytes, without waiting
for EOF to complete the request. Validate the frame before any command is spawned.

After waiting for the direct command, the supervisor reports its exit/signal
outcome and remains alive until parent cleanup. Parent liveness uses a private
pipe whose writer is held only by the parent: EOF causes the supervisor to kill
its own group. Give the supervisor an independent remaining-budget watchdog too.
An early parent exit must not leave a command waiting indefinitely. The command
must not inherit either control pipe. The helper never loads enrollment state.

The parent sends SIGKILL to its retained supervisor group on normal completion,
timeout, cancellation, output overflow or helper failure, **before reaping the
group leader**. An unexpectedly exited leader remains an unreaped child until
this cleanup, preventing PID/group reuse during the signal. Never run a generic
`Cmd.Wait` goroutine that reaps that leader before group cleanup. Never issue a
destructive group signal after reaping it, or use zero/-1 as a group target.
This also removes descendants when the direct command exits before them.

Close pipe readers after a maximum one-second cleanup window. Retain at most
64 KiB stdout and 16 KiB stderr per step in memory, separately; exceeding either
limit terminates the group and marks truncation. Continue no later step. Control
channel overflow/malformed data is a helper failure. Do not use an unbounded
CombinedOutput or wait indefinitely for inherited pipe descriptors.

Release the runner slot only after the supervisor is reaped, readers finish and
the original group is absent. After reaping, signal 0 may only probe group
existence; no further destructive signal is permitted. Until absence is observed,
hold the slot and report cleanup pending. Possible group-ID reuse can conservatively
delay availability, but must never cause another process to be killed. A kernel
task stuck in uninterruptible I/O may remain after SIGKILL; return a bounded
unknown outcome while retaining the slot/reaper. Never accumulate replacements.

The native unit must retain `NoNewPrivileges=true` and use explicit
`KillMode=control-group`, `SendSIGKILL=yes` and `TimeoutStopSec=5s` when baseline is
deployed. Systemd service cleanup supplements per-check cleanup. A trusted binary
that deliberately escapes its group is outside the v1 profile assumption; this
is not containment for hostile executable code. Do not introduce a root helper,
extra cgroup service or filesystem namespace that breaks disk's mount view.

## Execution evidence

Runner results describe execution, not health. Each attempted step includes its
step/profile, monotonic duration, outcome, nullable direct-command exit code or
signal, bounded stdout/stderr bytes, separate truncation flags and cleanup status.
The supervisor's intentional SIGKILL is not the command's exit status.

| Outcome | Meaning |
| --- | --- |
| `exited` | Direct command finished; exit code 0..255 or signal is recorded. A nonzero exit may be meaningful to a normalizer. |
| `policy_rejected` | Recipe/arguments/identity/path policy failed; no command launch for the rejected step. Whole-recipe syntax rejection launches no steps. |
| `spawn_failed` | Approved process could not start. |
| `timed_out` / `cancelled` | Deadline or caller cancellation ended the step. |
| `output_limit` | A stream exceeded its fixed cap; bounded prefix and truncation are explicit. |
| `helper_failed` / `cleanup_pending` | Completion could not be established or owned work has not finished cleanup. |
| `runner_busy` | No new recipe was launched. |

Do not coerce a timeout, empty output, bad encoding, missing step, signal,
truncation or unconfirmed cleanup into exit 0 or a healthy result. Resolve races
under one result owner: cancellation/deadline/overflow observed before complete
command-and-stream evidence prevents a successful interpretation. Freeze returned
buffers; no reader may mutate them after return.

Raw output exists only in bounded process memory; result JSON excludes the raw buffers. Do not log, persist or upload
it; APT diagnostics and system configuration can contain sensitive details.
Allowlisted normalizers emit typed counts, booleans, timestamps and reason
codes. The server derives health from those observations and the immutable recipe
revision. Logs expose only stable event/reason, step ID, duration and limits.

## Implementation boundary and sources

Test-only process fixtures cannot be selected by production recipe fields or
environment. Production execution requires the complete supported compiled policy.

Technical references:

- [Go os/exec](https://pkg.go.dev/os/exec): argument arrays avoid implicit shell
  evaluation; default context cancellation alone kills only the direct process.
  Its pipe-wait behavior requires explicit bounded ownership here.
- [Linux no_new_privs](https://docs.kernel.org/userspace-api/no_new_privs.html):
  prevents gaining privileges through exec and is inherited by descendants.
- [Linux kill](https://man7.org/linux/man-pages/man2/kill.2.html) and
  [wait](https://man7.org/linux/man-pages/man2/waitid.2.html): group signalling,
  non-destructive existence probes and child reaping inform the cleanup design.
- [Debian APT](https://manpages.debian.org/trixie/apt/apt-get.8.en.html): simulation
  uses current local state with locking disabled; adding dependencies is a
  separate simulation mode. This contract does not permit package mutations.
- [Debian systemctl](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html)
  and [systemd.kill](https://manpages.debian.org/trixie/systemd/systemd.kill.5.en.html):
  bounded selected-property reads and service cgroup cleanup.
