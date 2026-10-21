# Background jobs and email

Native templates install optional user timers without enabling them. Jobs use
accepted immutable bundles, not mutable TypeScript from a serving checkout.
[Native releases](native-releases.md) explain bundle creation/pinning.

| Job | Typical cadence | Check successful work |
| --- | --- | --- |
| `tinywarden-history` | About every minute | Completed scan/fresh coverage, not only a waiting timer |
| `tinywarden-notifications` | About a minute after completion | Current unpaused route and completed sampling; inspect uncertain/failed attempts |
| `tinywarden-retention` | Hourly UTC | Complete bounded cleanup; zero eligible deletions is normal |
| `tinywarden-agent-catalog` | Six hours | Successful official signature verification and fresh catalogue state |
| `tinywarden-account-emails` | 30 seconds after completion | Successful jobs without stale claims; zero sends is normal for an empty queue |

Use the installation's service account:

```sh
systemctl --user list-timers 'tinywarden-*'
systemctl --user show tinywarden-history.service --property=Result,ExecMainStatus,ExecMainExitTimestamp
journalctl --user -u tinywarden-history.service -n 100 --no-pager
```

After installing compatible rendered units and pinning their job bundle, enable
only the selected timer with `systemctl --user enable --now NAME.timer`. A timer
being active does not prove that work or mail delivery succeeded.

## Prepare job execution

Create the ignored restricted `.env.jobs.local` with
`TW_MAINTENANCE_DATABASE=tinywarden`, replacing the example with your actual owned
database name. The templates require this file and load core connection settings
separately from `.env.production.local`.

Build a compatible immutable artifact and install its service drop-ins through the
[native snapshot/plan/apply procedure](native-releases.md). The drop-ins pin each
job to the verified absolute artifact path; the template's `current` placeholder
is not a symlink you should create to mutable source. This procedure also works
after the initial web-only installation, with optional timers still disabled.
Inspect `systemctl --user cat NAME.service` to verify its effective ExecStart,
environment file paths and runtime pin before enabling the intended timer.

## Monitoring notifications

Configure private SMTP values from [configuration](configuration.md), or disabled
transport when sending is unwanted. Capture is a local proof transport, not email.
Load only environment files that exist; examples use the main file plus mail file:

```sh
node --env-file=.env.production.local --env-file=.env.notifications.local --import tsx \
  scripts/notifications.ts status --expected-database tinywarden
node --env-file=.env.production.local --env-file=.env.notifications.local --import tsx \
  scripts/notifications.ts configure --expected-database tinywarden
```

Use the exact owned database name. Configure adopts the validated route explicitly;
changed environment does not silently adopt a different recipient. Enable the
notification timer only when actual delivery is intended. Warning/recovery choices
affect monitoring mail, not account mail. Submission uncertainty is not retried;
`acknowledge --expected-database tinywarden EVENT_UUID` records review without
resending or claiming inbox delivery.

## Account email

Account verification/recovery uses validated SMTP and its own transport/from
override. It does not require monitoring route configuration or a monitoring
recipient subscription. The web and dedicated account worker load the applicable
mail files. Enable `tinywarden-account-emails.timer` after its compatible bundle,
unit and schema are installed.

A request enqueues promptly; the worker checks eligibility and submits asynchronously.
Verification requests expire if not processed promptly. Submission failure or
uncertainty is not automatically replayed; request a new link if needed. A relay
acceptance is not proof of inbox delivery. After a database restore, keep the timer
paused and invalidate restored account tickets/jobs before resuming.

## History and retention commands

```sh
node --env-file=.env.production.local --import tsx scripts/history.ts status --expected-database tinywarden
node --env-file=.env.production.local --import tsx scripts/retention.ts --expected-database tinywarden
```

Retention without `--apply` previews. Explicitly appending `--apply` deletes eligible
expired detail in bounded transactions while preserving compact retry/authority
records. Pausing cleanup stops physical deletion; age filtering still applies.
After recovery use the documented [continuity and mail reset](backups-and-recovery.md)
before resuming jobs.
