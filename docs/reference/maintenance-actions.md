# Maintenance action contracts

Maintenance providers perform explicit administrative changes on a host. Monitoring
skills observe through the read-only SDK; their descriptors cannot register a root
maintenance provider. Signed agent self-update retains its separate release-only
protocol. Fleet maintenance windows retain their notification-suppression behavior.

## Action identity and readiness

The registry in `lib/maintenance` defines versioned actions, required prerequisites,
platforms, approval requirements and conflict domains. The application and installed
agent must both support an action. An agent capability alone does not establish a
recognized installation: the app also verifies its reported binary/runtime/descriptor
identity against the signed release catalogue.

`maintenance_jobs.v1` is the maintenance capability. Its readiness record contains
`capability`, `worker_ready` and closed `actions` entries with `id`, `ready` and
`missing` prerequisites. Unsupported, unrecognized, incompatible or unready hosts
cannot acquire maintenance authority. Missing optional maintenance prerequisites
must not disable monitoring or ordinary signed updates. The initial Debian provider
uses `apt-get` and optional maintenance package `python3-apt` for both actions,
sharing strict configuration/trust validation. It never installs prerequisites
automatically. Refresh still performs index changes only.

The server's Agent settings/details read includes a bounded `maintenance_actions`
projection for each registered action: a state and `missing_packages`, plus report
and validity instants. It uses existing host-access/session authorization. Only
fresh reports matching the signed catalogue may recommend prerequisite packages;
registry metadata maps capability prerequisites to installable package names.
Unknown/future/stale reports, unavailable catalogue, unrecognized installation,
unsupported agent, unavailable worker and host/action conflicts remain distinct.
Expired or failed browser reads hide package advice. This read does not enqueue
work, alter update policy or install prerequisites.

The package actions are `packages.refresh.v1` and
`packages.upgrade_conservative.v1`. Conservative policy preserves package holds and
excludes additions, removals, downgrades and automatic repair. Refresh authorizes
index updates; preparation and package-install approval are distinct intents.

## Durable records and fencing

The maintenance domain owns per-host jobs, immutable provider plans, immutable
approval receipts and ordered immutable events. Jobs bind the parent Fleet
operation, explicit host, agent, credential generation and provider version.
Approval binds exact structured content and the reviewed order, rather than a
translated summary or a mutable package count. Repeating an ID with different
content is a conflict.

A job records phase, attention, cancellation intent, mutation effect, potential
process activity and the irreversible apply attempt separately. An attention
threshold is not evidence that a native process stopped. Expiry must not release
an uncertain transaction. Unresolved work retains host fencing until reconciliation;
it cannot become a second install attempt because a browser or acknowledgement
was lost. Active details and recovery evidence must survive routine retention.

Before native writes, compare the approved package/version/archive plan again
under actual APT/dpkg locks. The shared agent mutation lock also excludes signed
installation changes; it preserves the existing deployed lock pathname.
Root package work must run independently of the web request and the signed
updater's five-minute service timeout. A package error can leave a partly changed
host. There is no automatic rollback, repair, reboot or immediate-stop guarantee.

## Plan format and verification coverage

Provider plans contain exact package names/architectures, old/new versions,
authenticated archive checksums and sizes, kept-back identities, policy and
installed/source/index/configuration/selection and local package-metadata fingerprints. Canonical JSON uses
sorted object keys, integer numbers and ASCII Unicode escapes. Array order is
preserved. App and agent retain the same independent digest fixture.

The application attaches a separate verification snapshot. It pins each configured
check's package/settings/context identity, original observation, baseline severity
and resource statuses. Settings or monitoring-context changes invalidate that
coverage. New observations must establish the result; cached health or a package
process exit code alone cannot authorize the next server. Unconfigured checks
remain explicitly distinguishable from verified service health.

Bulk package execution is serial. Only the reviewed first host receives a start
grant; later grants require its verified success. Failure, uncertainty, changed
plans, expiry or lost authority stops further dispatch. Preparation can use bounded
concurrency without pre-authorizing later installations.

## Transport, cancellation and cleanup

The agent lane uses a closed, authenticated `maintenance_jobs.v1` request with
host, agent, generation, job, sequence, event kind and typed data. Polls use
sequence zero; at most256 immutable events belong to a job. Every non-poll event
must be the next sequence or an identical retry. A changed retry is a conflict.
The response repeats the scope and acknowledged sequence. A replay retains its
original decision, with fresh outer server time so a start grant cannot renew.

Control envelopes are limited to64KiB. Canonical provider plans are limited to
4MiB/5,000 package changes and transfer in ordered32KiB base64 chunks (at most128).
All chunks, the full digest and canonical encoding must agree before a plan can be
approved. Summaries cannot substitute for complete approved content. Provider
results have allowlisted typed facts; blocked-subject summaries are bounded to32
identities with a separate full count. Raw command output is not browser data.

A final60-second start grant pins the immutable approval, host generation and a
single attempt. Authority, fresh recognized installation, verification coverage,
plan expiry, host conflicts and reviewed predecessor outcomes are checked under
the shared access/package/host order. Another approval cannot bypass unfinished
work in the same operation. No transaction or database lock spans HTTP or APT.

Normal completion saves the authenticated terminal acknowledgement before removing
its local mutation fence. On restart, the root poller resumes removal of only that
exact acknowledged fence under the shared guard and worker-cgroup exclusion.
It retains the receipt and never invokes the provider again. A corrupt/mismatched
scope, uncertain result or pending recovery outbox remains blocked. Read-only
recovery closures use their separate ordered release protocol.

Cancel is explicit and replayable. Undelivered work can be cancelled immediately;
delivered pre-apply work keeps its reservation until the root worker acknowledges
a safe stop. Applying work receives Cancel remaining: verification continues and
later targets do not start. A timeout classifies uncertainty and never kills a
native package process. An ordinary completed receipt with outstanding attention
requires explicit Admin acknowledgement. Revoked-scope recovery uses the separate
authorization and ordered release below. A failed
outcome remains failed after that acknowledgement.

The cleanup owner includes jobs, plans, approvals, events, upload parts, manual
verification links and scoped recovery authorizations/receipts. Terminal details follow configurable retention, default90 days.
Active or uncertain jobs and their linked Run now receipts are protected. Removed
host cleanup retains the existing durable purge-stage numbering; a shared approval
keeps only opaque ordered identifiers while another target still references it.

## Native adapter ownership

The host agent owns the Debian adapter under `internal/maintenance/apt`. Its Python
source is embedded into the signed executable and uses Debian's system python-apt
bindings. It is separate from the monitoring SDK assets and grants no root access
to skills. The adapter exposes closed internal phases and plan digests, rather
than operator-supplied command strings, arguments, environment or import paths.

An install uses one native PackageManager with the required archive set. It does
not use the automatic refetch/retry loop in high-level Cache.commit. Downloads
must retain APT's `_apt` sandbox; an unexpected fallback or configuration change
blocks execution. Locally modified dpkg/ucf conffiles are retained, debconf uses noninteractive
package defaults, and needrestart uses list-only policy. The supported hook set
contains Debian apt-listchanges, dpkg-preconfigure and needrestart hooks; other
execution hooks block preparation for local operator review. Hook content,
preferences and trust inputs are fingerprinted rather than silently rewritten. Package maintainer scripts can still restart services or
perform other root operations; noninteractive settings cannot predict every
package decision.

The completion receipt reports reboot requirements separately from configuration
and service review. Configuration review detects retained `.dpkg-dist`,
`.dpkg-merge` and registered `.ucf-dist` replacements. Service review uses
needrestart's batch/list-only library check when available; it never requests a
restart. An unavailable, malformed or timed-out review is unknown, not “none.”
These facts do not replace fresh configured skill observations or prove service
health. A recovered completion retains the original review facts.

The Debian provider blocks the whole transaction when recognized kernel,
initramfs, bootloader or EFI work has no supported critical-space estimate. Rules
cover installed and candidate payload/control metadata and declared trigger effects,
including a changed package activating an unchanged initramfs handler. A blocker
names affected packages; the operator reviews them on the server and prepares
again. Packages are never silently dropped from an approved transaction.

Download/unpack reserves apply to actual destination filesystems and include bytes,
inodes and writable-path checks. Preparation checks installed destinations; archive
inspection adds newly introduced destinations and checks them again before apply.
The byte estimate includes downloads, twice the larger declared or inspected
unpacked footprint, and a 512MiB reserve. Inode reserves include 1,024 plus the
larger inspected entry count or 64 entries per changed package. Read-only bind
mounts are checked even when they share a device with writable storage. Terminal
symlink targets and existing empty directories do not invent writes on unrelated
filesystems; ambiguous payload aliases or unsafe destination ownership are refused.
An unrelated small EFI partition does not receive
the entire userspace reserve. These reserves are estimates; arbitrary scripts and
local hooks can perform additional writes or restart services. There is no general
proof of safe script behavior or automatic rollback. Known critical work without
a supported estimate is refused rather than assigned a guessed allowance.

Upgrade archive acquisition initially supports effective HTTP(S) methods with
trusted signed indexes and exact archive hashes. Direct file/media and ambiguous
methods are unsupported. Normal APT signature/expiry checks apply to both HTTP and
HTTPS. Every actual PackageManager input must be the inspected, hash/size-verified
regular file inside controlled cache storage. A valid archive elsewhere in the
cache cannot vouch for a different install input. Symlink/path bypass and apply-time
fetching are refused. Refresh retains its own strict index-only contract.

During preparation and final comparison the provider also checks the cached signed
Release metadata's `Date` and optional `Valid-Until` against the host clock.
Opening the package cache alone does not repeat that expiry check. The check uses
libapt's actual index destinations without fetching new metadata at the install
boundary. Upgrade currently requires the default repository time policy: custom
minimum/maximum validity, future-date allowances and alternate InRelease paths
require local operation. Refresh retains APT's native time-policy behavior.

Check available metadata during preparation and candidate archives after approved
download, before issuing a start grant. A newly discovered blocker prevents all
package installation. Revalidate policy, relevant local metadata and exact inputs
under final native locks. The final start gate uses the kernel boot identity and
CLOCK_BOOTTIME, including suspend time; it is unrelated to monitoring evaluation
clock normalization. A reboot or expired start allowance prevents a new install.
Package lock, acquisition and fixed metadata-reader budgets also include suspend
time. Cancellation during safe preparation unwinds its child processes before
returning; these reader/download limits never target native installation.
Expiry never becomes a timeout for an already running package process. A changed plan requires new preparation and approval;
blocked work and solver-held packages have distinct outcomes.

See [Fleet contracts](fleet-management.md), [managed updates](agent-updates.md),
[read-only host access](skills/host-access.md) and the [Playbook](../contributing/playbook.md).

## Read-only reconciliation after revocation

A revoked agent credential cannot report old work, and replacement credentials
cannot inherit it. An enabled current Admin can issue a separate recovery
authorization for one retained job, old host/agent/generation, provider, plan,
approval, granted attempt and revision. It authorizes integrity inspection and
closing that recovery transaction. It grants no package execution, enrollment,
command, repair, reboot or renewed apply attempt.

First acceptance expires after 15 minutes and rechecks the issuing Admin's current
authority and exact job revision. The token can be replaced/revoked before
acceptance. Once acceptance commits, that exact recovery cannot be recalled;
receipt delivery survives expiry or later Admin disablement. Each step has an
immutable digest: exact retries return the original decision, changed retries
conflict. Tokens are displayed once, stored as digests by the app and accepted
only by the separate bounded `/api/v1/maintenance-recovery/{describe,accept,finalize}`
lane. They do not count as agent contact or fresh check results.

The managed root CLI uses a hidden prompt or standard input:

```sh
sudo /opt/tinywarden-agent/current/tinywarden-agent maintenance \
  --config /opt/tinywarden-agent/config.json --reconcile
```

Use the actual managed installation path for a custom installation. Repeat the
same invocation to resume a saved recovery. `--authorization-prompt` requests a
replacement authorization through the hidden prompt; `--authorization-stdin`
reads it from standard input. These flags are mutually exclusive. Never place the
secret in an argument, URL or shell history. Unfinished exact requests and their
authorization are retained only in the validated root-private outbox; the secret
is erased after final acknowledgement.

The CLI verifies the signed managed executable and old retained installation
scope, acquires the shared host mutation guard, checks for lingering worker
cgroups/unsettled updater work, and acquires actual native package locks. Debian
inspection checks dpkg integrity, dependency state, status and architecture-aware
selection fingerprints. It runs no refresh, resolution, download, package hooks,
installation or automatic repair. Busy, dirty, corrupt or ambiguous state retains
the fence. Explicit manual repair is outside this action.

Release is ordered:

1. Root saves and submits the scoped read-only inspection. App acceptance retains
   the host/lifecycle/purge fence and Cancel remaining for the old batch.
2. Root obtains fresh native integrity proof and keeps native locks through its
   local journal commit. It durably closes old execution, clears/fsyncs only the
   matching local fence, then saves its local-release receipt.
3. App accepts that immutable receipt before clearing its recovery fence. Root
   retries lost acknowledgements without executing old work. The poller can retry
   saved released receipts, but cannot initiate an audit or clear a fence.

Inspection may find a different clean package state after manual repair. Recovery
is a separate fact and never converts an original failed/unknown job into success,
asserts healthy services, fabricates check results or resumes a failed canary's
remaining targets. New package work needs current readiness and a fresh plan and
approval. The root journal has an explicit recovery closure; `local_verified` on
the original package result keeps its original meaning.

Unfinished accepted recovery protects its job, plan and receipts through normal
retention and purge. Completed recovery follows configurable retention, default
90 days. A deleted completed receipt is never recreated from a late retry. Local
release evidence remains historical; unavailable remote receipt history does not
restore a fence or authorize execution. Installer mutations remain blocked while
a recovery outbox is pending, preserving the ability to finish its delivery.

The token is scoped bearer authority from a current Admin; it does not provide a
separate cryptographic attestation of root execution. The signed local path
independently enforces native locks, inspection and fence ordering.


## Fleet review and presentation

Admin Fleet menus project the same source-owned action registry and readiness
rules as command admission. Individual and selected-server preparations name
eligible and skipped servers before submitting an immutable explicit scope.
Refresh queues immediately after confirmation; Conservative upgrade prepares
only until an Admin approves exact plan IDs and digests in a chosen canary order.

`GET /api/v1/operator/fleet/maintenance/:id` returns bounded summaries, receipt
facts and ordered approvals. The Admin-only `plans/:plan` review route pages all
changes, kept-back packages and verification coverage in groups of 25. It checks
operation membership and preserves the saved digest. Summary queries project
counts and estimates in PostgreSQL rather than loading every raw plan into Node.
Application-owned labels come from the catalogue; provider metadata supplies data,
not executable UI or markup. A new provider owns its normalized review adapter.

One shared dialog advances through review, approval, cancellation and recovery.
Polling preserves ordinary focus; step changes focus the heading. Expired or
changed selected plans block approval. A lost write reply locks the dialog and
retries the exact saved request; it never substitutes a fresh action. Closing the
dialog neither approves nor cancels a job; its operation remains in Activity.

Recovery secrets are held only in component memory and displayed once. Clipboard
copy is explicit. The CLI command uses a hidden authorization prompt and contains
no secret; URLs, browser storage and subsequent API request bodies do not receive
the token. Expired/revoked authorizations are hidden and need replacement before
acceptance. After acceptance the same server resumes receipt delivery without a
new prompt. Finalization hides the command and retains the original outcome.


## Safe phase budgets and input ownership

The coordinator bounds each entire preparation and download phase to 30 minutes
with a boot-scoped CLOCK_BOOTTIME deadline, including suspend and time spent in
all metadata readers. It rechecks returned results between watchdog ticks too.
Cancellation unwinds safe native helpers and their fixed reader/download children.
Apply has no cancellation context or time-limit kill; its start grant is checked
before the one native transaction and never used to interrupt that transaction.

Input hashing walks each original path and symlink target from an anchored root
directory descriptor. Every directory and regular leaf must be root-owned and
not group/other writable; symlink hops must be root-owned and bounded. Trusted
root aliases remain supported. An empty input directory or absent optional leaf
still requires protected ancestors, so another user cannot insert a file between
final hashing and native use. Special files cannot block the hash reader.

The native app job `maintenance-jobs.mjs` runs a bounded fair classification sweep
from `tinywarden-maintenance-jobs.timer` about once a minute. It checks 10 jobs per
invocation, under the same access/package/host lock order. It classifies expiry,
attention and verification; it cannot issue approval, dispatch package commands,
kill a worker or release an uncertain fence. The job is built/pinned with the
immutable native job artifact and activated explicitly with the compatible schema.


APT 3 creates an `_apt`-owned `lists/auxfiles` scratch directory even for normal
acquisition. The provider accepts that specific directory only while empty;
nonempty auxiliary method inputs need local review and are refused. It is not a
permission exemption for index/configuration files. See the primary
[APT acquisition source](https://sources.debian.org/src/apt/3.0.3/apt-pkg/acquire.cc/)
and [auxiliary item source](https://sources.debian.org/src/apt/3.0.3/apt-pkg/acquire-item.cc/).
