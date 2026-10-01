# Native installation, release tooling and P4 jobs

The [native contract](native.md) owns the single checkout, service identity and
changed-component release matrix. This guide supplies repeatable commands, not
deployment authority. The current instance runs the approved P4 release and jobs.
Never run these apply commands just to
verify tooling. Use the existing PostgreSQL 18 instance and one `tinywarden` login.

## First installation

Use the `tinywarden` account with linger enabled, Node 24, npm 11.16.0, PostgreSQL 18
client tools and the existing database instance. Install the reviewed source at
`/home/tinywarden/tinywarden`; unit paths intentionally name that checkout.
An administrator supplies an owned database and the private mode 0600
`apps/web/.env.production.local` using [.env.example](../../apps/web/.env.example).
Keep `PORT=10007`; configure a public HTTPS reverse proxy to that port. Do not
initialize another cluster, create extra PostgreSQL roles or copy a second serving
application. Do not put credentials in command arguments, source or transcripts.

After explicit installation authority, in `apps/web`:

```sh
npm ci --include=dev --no-audit --no-fund
node --env-file=.env.production.local --import tsx server/db/migrate.ts tinywarden
node --env-file=.env.production.local --import tsx scripts/operator.ts init
npm run build
```

The operator CLI prompts locally; its default password policy applies. Consult
[operator access](../security/access.md) for account management.
Link the root `infra/systemd/tinywarden.service` into the account's user manager,
reload, enable and start it. Verify user service/listener, public HTTPS login and
one authenticated inventory read. This first-install sequence creates no operator
session automatically; subsequent upgrades use the release entry point below.
Enroll each additional Debian 13 host using the [agent instructions](native.md#debian-13-agent-installation)
and a separate one-time token. Preserve each host's own private configuration/state;
never copy enrollment credentials or state between hosts.

## Accepted source and upgrade entry point

Run commands from the root checkout. An exact source snapshot consists of a Git
tree object plus SHA256 for every Git-owned non-Markdown path. `snapshot` uses a
temporary index, leaves the real index/history untouched and writes a new private
descriptor outside the checkout. Include new intended paths in Git's inventory
before capture. Unknown non-ignored files, missing source, changed bytes or a
different tree inventory block application. Documentation can advance without
invalidating runtime evidence. A snapshot itself is not acceptance: test the exact
tree and retain its phase results; final review selects the accepted descriptor.

```sh
node scripts/native-release.mjs snapshot --output /home/tinywarden/backups/p4-source.json
node scripts/native-release.mjs plan --release /home/tinywarden/backups/p4-source.json --scope web,schema,dependencies --expected-database tinywarden
```

Use only the selected scope: `web`, `schema` or their combination. Add
`dependencies` with `web` only when the lock/install changed. Documentation-only
and bounded SQL changes use the existing native checklist, not this upgrade tool.
The plan checks source, Node/npm, private environment, database/role/schema owner,
PostgreSQL 18 dump tools for schema changes and existing service checkout. It
performs read-only database and service inspection. It never applies a migration,
builds, changes a service or contacts mail. The CLI suppresses subprocess output
which might contain secrets; failures remain visible through exit status.

If the host's global npm is outside the pinned range, set `TW_NPM_CLI` to an
already verified local npm 11.16.0 `bin/npm-cli.js`. The tool checks its version;
it does not install or change the global npm. Supply a private mode 0600 cookie
file containing one valid local operator Cookie header, not a password or an
entire HTTP response. Do not print it. After explicit release authority:

```sh
node scripts/native-release.mjs apply --release /home/tinywarden/backups/p4-source.json --scope web,schema,dependencies --expected-database tinywarden --backup /home/tinywarden/backups/p4-release-unique --cookie-file /home/tinywarden/backups/operator-cookie
```

The backup directory must be a new absolute path outside the checkout. Apply
excludes concurrent releases with a checkout lock. It pauses only already active
project timers and waits at most240 seconds for their bounded jobs to finish;
it does not kill an in-flight job. Then it stops web, preserves affected artifacts,
creates/checks one custom dump for schema changes, installs dependencies only
when selected, runs migrations once, verifies the exact ledger, builds only for
web changes and rechecks source. It links/starts the same user service and checks
public login 200 plus authenticated inventory 200 without redirects. Only timers
active before this upgrade resume after successful smoke; new timers stay opt-in.
The HTTP probe proves access, not every fleet condition. Use one current contact
readback when delivery changed; retain matching UI and agent proof otherwise.

Mode 0700 backup directories contain mode 0600 artifact/env/dump/release records.
No secret values, addresses, bodies or cookie enter the JSON record. Remove the
temporary cookie after use. A failed step stops in the documented safe state,
pauses timers and records its phase. There is no automatic restore/retry/old-code
start. Use a separate forward-repair, proven compatible code reversion or approved
database recovery decision. After a crash, inspect the recorded phase/processes
before manually removing `.git/tinywarden-release.lock`; never steal the lock.
The preserved old build is recovery material, not a second deployment or proof
that its code is compatible with the resulting database.

Dependency installs explicitly include build dependencies even under
NODE_ENV=production. On failure, cleanup stops web after any attempted start,
including a command with an uncertain result. The private release record's
`cleanup` entries distinguish confirmed stops from `stop_unconfirmed`; an
unconfirmed stop requires service-manager inspection before recovery.

## Agent package

The P4 agent runtime is unchanged. Carry forward matching P3 execution/VM evidence;
do not replace a running agent for a control-plane-only release. After a gate builds
the agent, package that reviewed binary offline:

```sh
node scripts/native-release.mjs agent-package --release /home/tinywarden/backups/p4-source.json --binary /home/tinywarden/tinywarden/bin/tinywarden-agent --output /home/tinywarden/backups/tinywarden-agent-p4.tar.gz
```

The archive contains the binary, reviewed unit, install guide, project license and
Go standard-library redistribution notice. Adjacent
metadata records the accepted source tree, binary and unit hashes; verify these
against the gate's artifact evidence. Packaging neither builds nor installs the
binary and does not certify an arbitrary supplied binary's provenance. Deployment
preserves `/etc/tinywarden-agent` and `/var/lib/tinywarden-agent`, follows the native
guide and needs host-specific authority. No private configuration enters a package.

## Optional P4 jobs

After schema 001–009 and P4 web are installed, prepare ignored mode 0600
`.env.jobs.local` in `apps/web` with `TW_MAINTENANCE_DATABASE=tinywarden`.
The job services share the private base environment. Notifications additionally
require `.env.notifications.local`; provider credentials remain private. Neither
timer is linked/enabled by the web release tool. The service-owning account is
`tinywarden`; inspect journal and guarded CLI status for failures.

| Unit | Cadence and bounds | Activation / recovery |
| --- | --- | --- |
| `tinywarden-retention.timer` / `.service` | UTC hourly; one catch-up after downtime; the existing 30-second/1000-run cleanup bounds;45-second unit timeout | Link both assets after cleanup approval; enable/start the timer. Disable/stop timer to pause physical deletion; age filtering remains active. |
| `tinywarden-notifications.timer` / `.service` | First run 60 seconds after boot; 60 seconds after previous invocation completes; no overlap or missed-tick replay;180-second root/210-second unit timeout | Configure the selected route through the guarded CLI first. Capture is local proof only. Real SMTP configuration, send and timer enablement require separate approval. |

Use `systemctl --user link` for each reviewed service/timer pair, `daemon-reload`,
then `enable --now` only for an approved timer. Status/log commands use its exact
unit name. Timer/job failures have no automatic restart loop; a later scheduled
invocation observes the durable state. The database session lock excludes any
overlapping notification CLI invocation. Retention's atomic bounded batches and
lock timeouts guard concurrent manual cleanup. Journal contains safe CLI outcomes.

## Recovery and rollback boundary

Follow [data recovery](../architecture/data-lifecycle.md#recovery-contract-and-focused-acceptance)
and [notification recovery](../architecture/notifications.md). Pause/drain jobs and
stop web before an approved restore; restore on the existing instance only after
choosing/reporting the backup point and lost gap. Verify ledger/counts/constraints/
permissions, sessions, newer revocations/generations and preserved agent sequences.
Never lower agent counters to fit a restored database.
Retire the restored notification epoch with the guarded `configure --rotate`
before any notification timer resumes, even if settings are unchanged. Keep
sending disabled during recovery; acknowledge uncertainty without resending.
After physical retention, code which ignores compact receipts is not a valid
rollback. There is no down migration or silent history resurrection. The full
P4 populated restore/authority/retry proof is a phase gate; routine additive
upgrades reuse matching proof under the native matrix.

PBS handles this host's backups under the owner's policy. Local restricted release
files are sufficient here; tooling does not upload, prune PBS history or invent
a second export retention policy. Before any future live release, select the
accepted exact source/artifacts, confirm current private configuration and obtain
the separately required activation authority.

## Local release evidence

Sol preparation, R1–R2 repairs and final Astra acceptance completed 2026-10-01.
P4 is complete locally; the evidence and operational limits below apply.
Preparation and review performed no live deployment or activation; the subsequent
approved live result is recorded below.
The original prepared runtime source is Git tree `9695e222b29d2b2d54c0f5d843496bdcbff7559c`,
with 296 non-Markdown path fingerprints. Git's history/index were not committed
or replaced. The tree includes the complete Go notice for the agent package.

The isolated complete `./scripts/verify.sh --phase-end` passed against tree
`5957cc0d62e27653d558382034c17939c8ca66c7`: pinned npm 11 reproducible install,
12 root cases and 188 web cases with no skips, lint/typecheck/build, Go format/vet/
tests/build/module verification, systemd syntax, zero npm/govulncheck findings and
zero secrets. This includes populated upgrade/receipt/authority/outbox/restore
proof on the existing PostgreSQL instance with the single login. The final
packaging adjustment changes only the native CLI's archive member list and map
roles among those 296 runtime paths; nine focused native cases, archive/hash checks,
333-path source/map and final exact-tree secret check pass. Matching294 paths
reuse the full gate. No repeated build or dependency install was needed.

Native tests exercise actual temporary artifact archives and private permission
checks with synthetic service/npm/migration drivers; they do not claim a live
install/upgrade. A real guarded PostgreSQL dump/list check and the web populated
restore tests verify the database tool boundary. The real CLI read-only plan
checks this host's existing service/configuration/owners. The offline archive
contains exactly binary/unit/guide/project license/Go notice, with reconciled
binary/unit/archive hashes and no private configuration.

All 115 agent runtime paths and existing rendered app/component sources match
accepted P3 source evidence. Carry forward its real Debian 13 agent, enrollment,
restart/contact and desktop/narrow/keyboard acceptance; multiple-host synthetic
fixtures also pass. No additional real host, rendered UI change or SMTP delivery
is claimed. New release-tool smoke behavior is tested with synthetic HTTP replies.
Final review accepted the repaired descriptor and migration/recovery and
compatibility boundaries as recorded below. GitHub checks require
the separately authorized published exact commit; deployment and real email
activation retain their separate authority.

## Final review repairs

Astra review on 2026-10-01 found two blockers in the original prepared release
tool. Sol implemented and verified both; focused Astra re-review accepted them.

- **R1 — build dependencies:** native install and first-install commands explicitly
  include dev dependencies with `npm ci --include=dev`. The phase install also
  sets NODE_ENV=production. Using the actual npm wrapper and pinned npm11.16.0,
  one real production-environment install/build passed in the existing isolated
  workspace, with PostCSS and TypeScript present. Serving dependencies/build were
  not replaced.
- **R2 — start failure cleanup:** an attempted service start is recorded before
  the command runs, so an effect followed by an error triggers owned stop cleanup.
  Safe `cleanup` outcomes record unresolved stops as `stop_unconfirmed`. Focused
  cases verify uncertain starts and failed web/timer stops without automatic
  restore, repeated migration or restart.

Repaired source is tree `ca9f3d9c830454f2d2d4e94adef72b79f85521f9`, with 296
non-Markdown fingerprints. Ten portable native cases pass; the unchanged guarded
PostgreSQL case was skipped in this focused run and retains its earlier passing
proof. Source/map333, catalog, shell syntax, whitespace, exact-tree secrets and
refreshed archive inventory/hashes pass. Only three runtime paths differ from the
prepared candidate: native CLI, its tests and the verification entry point.
Matching 293 paths reuse prepared phase evidence; agent artifact bytes are unchanged.

Retain unchanged web/database recovery and agent evidence. Acceptance of the
repaired descriptor does not grant deployment authority. No new live deployment, real
email, fleet test or repeated full repository gate was performed.

## Final acceptance

Owner-confirmed GPT-6 Astra XHigh accepted R1–R2 and their affected consumers on
2026-10-01. The production npm wrapper, install/build commands and evidence agree;
the repaired control flow attempts cleanup after an uncertain start, preserves
safe unresolved-stop outcomes and retains the no-restore/no-retry contract.
No blocking finding remains in the scoped review.

Accepted runtime source: `ca9f3d9c830454f2d2d4e94adef72b79f85521f9` with all
296 fingerprints reconciled. Its package metadata and unchanged agent archive
hash match. The complete phase gate, ten-case repair pass, actual isolated
production install/build and previously accepted database/agent/UI evidence
satisfy P4.7–P4.9. Review reused this matching proof without rerunning its tests.

P4.A–P4.C are complete locally. The subsequent approved live release is recorded
below. Publication and GitHub verification retain their separate exact-commit gate.

## Live P4 deployment

Deployed 2026-10-01 on owner-confirmed Sol High; the owner also explicitly approved
cleanup and real email alerts. Accepted tree ca9f3d9c830454f2d2d4e94adef72b79f85521f9
was applied once in the main checkout. Restricted artifacts/configuration and one
readable PostgreSQL 18 dump were preserved, changed dependencies installed, schema
001–009 applied/verified, and web built/restarted. Public login and authenticated
inventory smoke pass; web outage was 38.80 seconds. Matching phase tests, audits
and restore proof were reused.

Both job timers are enabled and active. The first 90-day cleanup completed with
zero expired rows; notifications use the approved SMTP route with warnings and
recoveries. Provider TLS/authentication passed and SMTP accepted the first real
alert; recipient inbox delivery is not proven by relay acceptance. The unchanged
agent retains P3 proof. No commit, publication or GitHub dispatch occurred.
