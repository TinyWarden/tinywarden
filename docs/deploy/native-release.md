# Installation and native releases

Use one selected serving checkout and optional native user services. Keep local
configuration, backups and installed units private.

## First installation

Use a dedicated account on a native Linux host with Node 24, npm 11.16.0 and
PostgreSQL 18. Check out the app at a path you choose. The package is at the
repository root. Prepare ignored, mode-0600 .env.production.local using
[.env.example](../../.env.example): your HTTPS origin, owned database and port.
TW_BIND_HOST defaults to loopback; select a network listener when your reverse
proxy needs it. Enable linger for a user service that must survive logout/boot.

From the root checkout:

```sh
npm ci --include=dev --no-audit --no-fund
node --env-file=.env.production.local --import tsx server/db/migrate.ts tinywarden
node --env-file=.env.production.local --import tsx scripts/operator.ts init
npm run build
node scripts/install-native-services.mjs --backup "$HOME/tinywarden-backups/first-install"
systemctl --user daemon-reload
systemctl --user enable --now tinywarden.service
```

The database name above must match your explicitly reserved database. The
installer copies rendered units into the user service manager and preserves
previous definitions in the new backup directory. It starts/enables nothing;
the final command starts only the app. Verify the listener, public HTTPS login
and an authenticated inventory read. Configure optional jobs separately below;
the three timers are never automatically enabled by installation or upgrade.
See [operator access](../security/access.md) and the
[agent installation](native.md#debian-13-agent-installation).

## Accepted source and upgrade entry point

Run commands from the root checkout. An exact source snapshot consists of a Git
tree object plus SHA256 for every Git-owned non-Markdown path and all trusted
runtime assets, including runtime Markdown files. `snapshot` uses a
temporary index, leaves the real index/history untouched and writes a new private
descriptor outside the checkout. Include new intended paths in Git's inventory
before capture. Unknown non-ignored files, missing source, changed bytes or a
different tree inventory block application. Documentation can advance without
invalidating runtime evidence. A snapshot itself is not acceptance: test the exact
tree and retain its phase results; final review selects the accepted descriptor.

```sh
node scripts/native-release.mjs snapshot --output $HOME/tinywarden-backups/source.json
revision=$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME + "/tinywarden-backups/source.json")).sourceTree')
node scripts/build-native-jobs.mjs "$revision" "$PWD/dist/native-jobs/$revision"
node scripts/native-release.mjs plan --release "$HOME/tinywarden-backups/source.json" --scope web --expected-database tinywarden --jobs "$PWD/dist/native-jobs/$revision"
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
node scripts/native-release.mjs apply --release $HOME/tinywarden-backups/source.json --scope web --expected-database tinywarden --backup "$HOME/tinywarden-backups/release-unique" --cookie-file "$HOME/tinywarden-backups/operator-cookie" --jobs "$PWD/dist/native-jobs/$revision"
```

The backup directory must be a new absolute path outside the checkout. Apply
excludes concurrent releases with a checkout lock. It pauses only already active
project timers and waits at most240 seconds for their bounded jobs to finish;
it does not kill an in-flight job. Then it stops web, preserves affected artifacts,
creates/checks one custom dump for schema changes, installs dependencies only
when selected, runs migrations once, verifies the exact ledger, builds only for
web changes and rechecks source. It installs independent rendered unit copies and starts the same user service and checks
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

Agent packaging now belongs to the [independent agent repository](https://github.com/TinyWarden/tinywarden-agent).
Use its scripts/package.py command and native guide. The app's native-release
entry point handles app snapshots/plans/applies only. An app release does not build, package or install an agent binary.

## Job bundle isolation

Jobs must not import TypeScript from a mutable serving checkout. The builder takes
an exact commit/tree and writes a new immutable bundle directory under
`dist/native-jobs/`, with source/output/dependency hashes. App source/catalogs are
bundled; third-party dependencies remain external and must match the manifest.
A verified `current` pointer selects the accepted compatible package for services.
No source fallback is used. Pin all active jobs before editing their imported code;
update their bundles/entrypoints together when shared schema or assessments change.

The release tool checks the selected package, changes its pointer with services
quiesced and resumes only timers that were previously active. First job activation
requires explicit operator configuration and timer enablement. History additionally
supports guarded `status` and post-restore `reset` commands; its sampler owns
continuity, independently of email delivery state.

## Optional background jobs

Apply all current migrations before configuring jobs. Prepare ignored mode 0600
`.env.jobs.local` at the repository root with `TW_MAINTENANCE_DATABASE=tinywarden`.
The job services share the private base environment. Notifications additionally
require `.env.notifications.local`; provider credentials remain private. No
timer is linked/enabled by the web release tool. Run services as the account that owns the checkout; inspect journal and guarded CLI status for failures.

| Unit | Cadence and bounds | Activation / recovery |
| --- | --- | --- |
| `tinywarden-history.timer` / `.service` | Every minute; bounded sampler | Configure its pinned bundle before enabling the timer. Reset continuity after restoration; do not backfill missed transitions. |
| `tinywarden-retention.timer` / `.service` | UTC hourly; one catch-up after downtime; the existing 30-second/1000-run cleanup bounds;45-second unit timeout | Install the rendered assets, then enable/start the timer when cleanup is intended. Disable/stop timer to pause physical deletion; age filtering remains active. |
| `tinywarden-notifications.timer` / `.service` | First run 60 seconds after boot; 60 seconds after previous invocation completes; no overlap or missed-tick replay;180-second root/210-second unit timeout | Configure the selected route through the guarded CLI first. Capture is local proof only. Real SMTP configuration and timer enablement activate external delivery. |

The installer renders all service/timer pairs without enabling them. Run
`systemctl --user daemon-reload`, then `enable --now` for each selected timer. Status/log commands use its exact
unit name. Timer/job failures have no automatic restart loop; a later scheduled
invocation observes the durable state. The database session lock excludes any
overlapping notification CLI invocation. Retention's atomic bounded batches and
lock timeouts guard concurrent manual cleanup. Journal contains safe CLI outcomes.

## Recovery and rollback boundary

Follow [data recovery](../architecture/data-lifecycle.md#recovery-contract)
and [notification recovery](../architecture/notifications.md). Pause/drain jobs and
stop web before an approved restore; restore on the existing instance only after
choosing/reporting the backup point and lost gap. Verify ledger/counts/constraints/
permissions, sessions, newer revocations/generations and preserved agent sequences.
Never lower agent counters to fit a restored database.
Retire the restored notification epoch with the guarded `configure --rotate`
before any notification timer resumes, even if settings are unchanged. Keep
sending disabled during recovery; acknowledge uncertainty without resending.
After physical retention, code which ignores compact receipts is not a valid
rollback. There is no down migration or silent history resurrection. Use populated restore/authority/retry checks when the recovery contract changes;
routine compatible additive upgrades reuse matching evidence under the native matrix.
