# Disk observation and historical meaning

[Definitions](check-definitions.md) owns assignment and immutable revision
references. [Data lifecycle](data-lifecycle.md) defines 90-day detail expiration
and compact retry receipts while preserving this wire contract.

## Every local filesystem

Selector version 1 enumerates mounted filesystems from `/proc/self/mountinfo` in
the host mount namespace. It observes capacity without opening filesystem content
or raw devices. The [kernel mountinfo contract](https://www.kernel.org/doc/Documentation/filesystems/proc.txt)
defines escaped paths, variable optional fields, the separator, device numbers
and per-mount identifiers. Parse those fields deliberately; mount IDs can be reused
and are not durable filesystem identities.

- Include local disk-backed mounts, removable media while mounted, and tmpfs
  (identified as memory-backed). Known local types initially include ext2/3/4,
  xfs, btrfs, zfs, f2fs, vfat, exfat, ntfs3, jfs, reiserfs, udf, iso9660, squashfs,
  erofs and tmpfs. This is capacity observation, not a filesystem-support claim.
- Exclude known kernel interfaces: proc, sysfs, devtmpfs, devpts, cgroup/cgroup2,
  securityfs, debugfs, tracefs, configfs, pstore, mqueue, hugetlbfs, ramfs,
  autofs, binfmt_misc, fusectl, rpc_pipefs, efivarfs, nsfs and bpf. Return bounded
  exclusion counts, not fake measurements. Do not trigger autofs mounts.
- Exclude known remote types nfs/nfs4, cifs/smb3, ceph, 9p, afs, coda,
  glusterfs and fuse.sshfs. Unknown types, other FUSE and overlay are explicit
  unsupported coverage because locality cannot safely be inferred from their name.
- Include read-only local mounts in detail with capacity if readable; mark them
  informational and exclude them from writable-capacity threshold alarms. A host
  with no measurable writable local mount has unknown capacity health.
- Keep bind mounts and subvolumes as separate mount observations, identifying
  that capacity can be shared. Never sum capacities or collapse records solely
  by device number. disk has no per-mount exclusions or overrides.

Unavailable permissions, malformed inventory, unsupported coverage, disappeared
mounts or exhausted bounds cannot silently produce healthy coverage. Record a
stable reason code; no raw operating-system error, source device, mount options
or filesystem content is sent. Mount path/type/root are protected host metadata.
Each path is valid UTF-8, at most 1024 bytes; an unrepresentable path makes coverage
incomplete without forwarding the raw bytes. Use the local mount ID only to join
one run's inventory, never as a global database identity. A mount path is a history
label and does not prove persistence of the underlying filesystem across runs.

Bound mountinfo to 4 MiB and 4096 entries; a result has at most 128 local/unsupported
mount records. Overflow yields explicit incomplete coverage, never a healthy
truncated result. Capture inventory before and after collection; any topology
change makes the run incomplete. Match opened mount descriptors against the
captured mount IDs before measuring, avoiding accidental measurements of a parent
filesystem after unmount. Resolve paths without following symlinks into a
different mount; inability to establish the match is unknown.

### Agent service view

The shared unit's PrivateTmp, ProtectHome, ProtectSystem and ReadWritePaths produce a
service-specific filesystem view. The agent unit omits those namespace-changing
directives for the collector to observe the host view, while retaining the
dedicated unprivileged account, NoNewPrivileges, private state directory and
UMask=0077. Do not add root, capabilities, setns or privileged helper services.
Ordinary Unix permissions still restrict access and may yield unknown observations.
This deliberately gives up systemd's read-only filesystem sandbox; it does not
give the account permission to write root-owned files. The collector itself only
performs bounded metadata reads. Verify the actual installed unit's mount view on
a supported host before claiming complete coverage.

## Measurement and evaluation version 1

Use filesystem capacity syscalls through the fixed Go collector. Linux's
[statvfs fields](https://man7.org/linux/man-pages/man3/statvfs.3.html) distinguish
total blocks, all free blocks and blocks available to unprivileged users. Let
`used = total - free` and `denominator = used + available`. Persist total/free/
available bytes as canonical nonnegative decimal strings, bounded to uint64;
use the reported fragment size (block size only if fragment size is zero), with
checked multiplication. Negative/overflowing values, free greater than total,
available greater than free or a zero denominator produce unknown.

Classify with exact integer comparison: critical if `100*used >= critical*denominator`,
otherwise warning if `100*used >= warning*denominator`, otherwise healthy. Use
arbitrary-precision integer intermediates; rounded display percentages never
drive classification. This measures used share of space usable by an ordinary
process and accounts for reserved blocks. Read-only mounts remain informational.
The server computes classification from these raw values and the referenced
snapshot; it never trusts agent-supplied health or current global thresholds for
historical evaluation. Inodes and physical device health are outside this slice.

The collector has a ten-second wall budget and bounded output. Run only the fixed
collector entry point in the same binary, with no caller-supplied executable,
arguments or shell. This containment is separate from baseline's recipe runner. The
parent keeps heartbeats responsive, kills only its owned helper on timeout and
records unknown. A kernel-blocked syscall may not terminate immediately: allow at
most one unreaped collector, and do not start another until it exits. Do not claim
that cancellation can always interrupt kernel I/O. Parent exit also terminates
its helper; service stop must cover the entire owned process group.

## Result authority, duplicates and ordering

Disk adds POST `/api/v1/agent/disk-runs`: current Bearer credential, schema_version=1,
run_id UUIDv4, generation-local positive run_sequence, assignment_id, started_at,
finished_at, coverage/reason codes and bounded mount records. No caller host ID.
Only this request may use a 1 MiB body; other requests/responses keep their existing
bounds. No compressed input. The local run_sequence is allocated durably before
collection and never reset within a credential generation, even after cache loss.

AcceptDiskRun uses the definition → host → agent → credential order and rechecks
current authority after waits. The snapshot must belong to that exact host, agent
and generation and have ready applicability. Old-generation credentials cannot
upload. A valid old-source snapshot can produce history, never current health.
Missing snapshot after restore commits a current-generation recovery latch before
409 `assignment_unknown`, never reassignment to current settings. A retained
older-source snapshot may still accept immutable history, but its run cannot
clear the latch or establish current health. Wrong-host or old-generation
credentials/snapshots fail their existing authority checks. Invalid
measurements/reasons fail validation.

Persist immutable run metadata, first server receipt time, snapshot FK and typed
mount rows in one transaction. Enforce unique run_id and (agent,generation,sequence)
and composite scope FKs. Retain a hash of the complete validated submission using
canonical field order and mount-ID order. An exact authorized duplicate returns
the original receipt without a new row, receipt time, contact renewal or health
advance; a changed duplicate returns 409 `run_conflict`. Concurrent retries must
reach the same result. Canonical request/response schemas and hashing order are immutable versioned
compatibility rules.

### Version 1 disk run wire and canonical digest

The exact request object has these fields and no others: `schema_version:1`,
`run_id`, `run_sequence`, `assignment_id`, `started_at`, `finished_at`, `coverage`,
`reason`, `excluded_kernel`, `excluded_remote`, `dropped_runs`, `mounts`. UUIDs are
lowercase v4. Sequence and dropped count are JSON safe integers in
`1..9007199254740991` and `0..9007199254740991`; excluded counts are `0..4096`.
Times are exact UTC millisecond strings `YYYY-MM-DDTHH:mm:ss.sssZ`. Coverage is
`complete` only with reason `none` and every mount measured. Incomplete requires
one stable reason from `inventory_unavailable`, `inventory_malformed`,
`inventory_overflow`, `records_overflow`, `topology_changed`, `mount_disappeared`,
`mount_inaccessible`, `mount_unverifiable`, `unsupported_type`,
`collector_timeout`, `collector_failed`, `output_overflow` or `queue_overflow`.

`mounts` is sorted by strictly increasing positive 32-bit `mount_id`, at most
128 entries. Every entry has exactly `mount_id`, `mount_path`, `mount_root`,
`filesystem_type`, `kind`, `writable`, `shared_capacity`, `reason`, `total_bytes`,
`free_bytes`, `available_bytes`. Kind is `local` or `unsupported`; the latter
requires reason `unsupported_type` and all byte fields null. Local mounts have
reason `none` and all three byte fields, or a stable failure reason and all three
null. Byte fields are canonical decimal uint64 strings without leading zeroes,
or null. For measured values, free ≤ total, available ≤ free and
`total - free + available > 0`. Paths/root are UTF-8, 1..1024 bytes, without
control characters. Filesystem type is 1..64 ASCII letters, digits, dot,
underscore, plus or hyphen. Source device, raw options and syscall errors are
never sent. The server rejects unknown fields, invalid order and inconsistent
combinations before transaction work.

The persisted `request_digest` is SHA-256 of UTF-8 compact JSON of this ordered
array after validation, using JSON booleans/numbers and decimal values as strings:

```text
[1,run_id,run_sequence,assignment_id,started_at,finished_at,coverage,reason,
 excluded_kernel,excluded_remote,dropped_runs,
 mounts.map(m => [m.mount_id,m.mount_path,m.mount_root,m.filesystem_type,m.kind,
  m.writable,m.shared_capacity,m.reason,m.total_bytes,m.free_bytes,m.available_bytes])]
```

The 200 receipt has exactly `schema_version:1`, `run_id`, `run_sequence`,
`received_at` (first server receipt, same UTC format) and `duplicate` boolean.
An exact replay returns that original receipt, including timestamp. A changed
run ID or sequence reuse gets 409 `run_conflict`. An unknown, wrong-scope or
non-ready assignment gets 409 `assignment_unknown`. The 1 MiB request limit
applies only to this route; no compressed body is accepted.

Migration `004_disk_runs` adds `disk_runs` and typed `disk_run_mounts`, with
host/agent/generation/snapshot composite scope and unique run ID and generation
sequence. The server stores classified mounts and worst measured writable mount
using exact integer comparisons against the immutable snapshot. Ingest does not
append an operator audit event or renew shared contact. PostgreSQL constraints and
one transaction prevent a partial run/mount history if insertion fails.
Migration `005_disk_recovery_latches` adds the sticky current-generation authority
marker shared by assignment fetch and run ingest. The rejection is returned after
that marker commits; a failure to persist it fails closed.

## Current health and buffering

History retains snapshot values/evaluator and the resulting classifications.
Current health first checks for a current-generation recovery latch. A latch
forces unknown `assignment_recovery_required` even if contact and an old-source
run are recent; history remains visible. Without a latch, health requires current
Shared contact, current credential generation, an assignment matching today's resolved source, complete coverage
and a recent observation. A default/policy change makes prior-source evidence
historical immediately, even before a new assignment is fetched. Old-response or
out-of-order uploads cannot replace the highest accepted run_sequence for a given
generation/assignment; an older healthy run cannot mask a newer failed run.

Freshness anchor is the earlier of agent finished_at and first server receipt.
Agent time over 30 seconds later than that receipt is clock-uncertain and cannot
establish current health; smaller positive skew is capped at receipt and never
extends freshness into the future. started_at must not exceed finished_at. Server time earlier than receipt
also yields unknown. Otherwise age must be strictly less than three assignment
intervals. Delayed offline uploads therefore cannot become fresh by arriving late.
Current status precedence: recovery latch, then revoked/unavailable contact;
incomplete/unsupported/clock-uncertain evidence is unknown; expired evidence is
stale; complete fresh evidence uses the worst writable-mount classification.
Keep any known critical/warning mount detail visible even with unknown coverage.
Neither fetch nor result upload changes the shared heartbeat contact clock.

Cache use for read-only collection expires 24 hours after the last successful
assignment validation (including not_modified); a detected backward clock invalidates
the lease. Configuration failure must not starve heartbeat. Bound durable pending
results to 100 runs and 8 MiB combined. Keep the ambiguous in-flight submission
byte-identical until acknowledgment; discard oldest other completed runs on overflow
and record a bounded dropped-run count. If even one run exceeds limits, emit an
explicit bounded failed-run result. Replacement abandons old-generation pending
runs visibly. Persist this state separately from shared identity and assignment files.
The disk agent saves the next generation-local sequence to `disk-sequence.json`
before launching collection. `disk-queue.json` holds validated, digested pending
request bytes and an explicit in-flight ID; both are mode 0600 and separate from
Shared identity and assignment files. The in-flight body survives interruption until
the exact receipt arrives. Overflow removes oldest other runs, preserves the
in-flight run and increments a bounded drop count. A corrupt queue disables the
Disk lane while heartbeat continues. Retryable outage responses leave the head
byte-identical for reconnect. Permanent 400/409 rejections pause only the disk
lane and retain its head for explicit recovery; heartbeat continues. A terminal
assignment fault durably invalidates the local offline collection lease while
retaining the known snapshot identity for rollback detection. Updates/outages must preserve these boundaries.
