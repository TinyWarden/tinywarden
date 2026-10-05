# Operations

Run the web app from the selected root checkout with private environment files and
optional user services. Installed units are independent rendered copies, not links
to mutable templates. PostgreSQL 18 and the configured `tinywarden` login own the
reserved project database. Keep origin, listener, port, proxy and backup locations
in private installation records; see [configuration](../deploy/configuration.md).

## Service checks

```sh
systemctl --user status tinywarden.service
journalctl --user -u tinywarden.service -n 100 --no-pager
systemctl --user list-timers 'tinywarden-*'
```

Check the selected listener and public HTTPS login, then one authenticated read.
A running web process does not establish database readiness or fresh agent contact.
For a stale server, inspect `tinywarden-agent.service` and its bounded system journal
on that host, its configured TLS origin and last contact. See
[agent operations](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/deploy/native.md).
Do not print credentials, raw requests/responses, unrestricted state or environments.

Use [scoped native readbacks](../deploy/native.md#select-only-the-changed-release-steps)
after changes. Replace/restart affected components and migrate once. Forward repair,
compatible code return and database restoration are separate choices; there is no
automatic restore or safe assumption that old code accepts new data.

## Backup, restore and failure recovery

The [data lifecycle](../architecture/data-lifecycle.md) defines receipt-aware
recovery. Backup retention is separate from the 90-day online observation window.
Select backup locations, retention and restore procedures for each installation.

For schema/data-rewrite changes, create a restricted PostgreSQL 18 custom-format
`pg_dump` of the exact reserved database and record source revision/time. Check
archive readability. A database dump does not include environment files, certificates
or remote agent state; preserve those separately. A populated restore rehearsal is
needed for destructive/recovery-contract changes, changed restore tooling/target
or absent matching restore evidence, not every compatible additive migration.

Rehearse on a new owned disposable database on the existing instance with
`pg_restore --single-transaction --exit-on-error --no-owner`. Restrict PUBLIC
connections first, retain archive ACLs and verify database/schema/table permissions.
Never restore over a serving database to test a backup. Compare ledger, row counts,
authority references and representative login/contact/results; row counts alone
cannot prove credential usability. Protect the archive and remove only rehearsal
resources you created. See [PostgreSQL archive](https://www.postgresql.org/docs/18/app-pgdump.html)
and [restore](https://www.postgresql.org/docs/18/app-pgrestore.html) documentation.

For actual restore, pause/drain jobs and stop web first. Report the backup point and
lost gap; verify preserved agent generations/sequences and newer revoked authority.
Never lower agent counters to fit restored data. Reset history continuity and rotate
the notification epoch before timers resume. Missing/regressed assignments keep
their recovery latch. Use schema-compatible source; no destructive down migration.

## Reading cleanup

The [retention CLI](../architecture/data-lifecycle.md#local-operation) offers a
bounded preview, then explicit `--apply`. Apply all current migrations before using
current tools. The optional hourly timer deletes expired detail while preserving
compact retry/authority evidence. Pausing it stops physical deletion; age filtering
still hides expired detail. Routine cleanup needs no per-run dump or export. After
a purge, pre-retention code is incompatible with receipt-aware ingestion.

## History and email

The optional history timer samples current states independently of email. Use its
`status` command to inspect capture; after restore, use guarded `reset` before
resuming capture. It records gaps instead of asserting continuity through downtime.
See [history](../architecture/change-history.md) and [job setup](../deploy/native-release.md#optional-background-jobs).

The [notification CLI](../architecture/notifications.md#local-commands) owns configure,
status, run and acknowledgement. Configure a route before enabling real SMTP delivery.
An uncertain attempt needs review; acknowledgement never means delivered and does
not resend. Keep sending disabled after restore and rotate the restored epoch before
adopting a new route. Never drain a restored mail queue.
