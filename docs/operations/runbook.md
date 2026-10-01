# Operations

The control plane runs as the enabled `tinywarden` user service directly from
`/home/tinywarden/tinywarden/apps/web`. Its tracked unit is linked from
`infra/systemd/tinywarden.service`; its private runtime configuration is the
ignored, mode-0600 `apps/web/.env.production.local`. Linger is enabled. The
existing PostgreSQL 18 instance and the single `tinywarden` login serve the app.

Before activation, identify the exact database cluster/role/database, reserved web
port, TLS ingress, backup storage, retention and restore procedure. Installed
PostgreSQL packages do not authorize inspecting or reusing another application's
database. Never reuse the historical development password in production.

Use `systemctl --user status tinywarden.service`, `stop`, `start` or `restart`
as required, and `journalctl --user -u tinywarden.service -n 100 --no-pager` for
bounded logs. Health must distinguish liveness, dependencies and stale host
observations. Confirm the service process works from the main checkout and is
the only TinyWarden listener on port 10007.

Follow the [scoped native procedure](../deploy/native.md#select-only-the-changed-release-steps).
Quiesce required writes, replace/restart only affected runtimes, apply pending
migrations once and run selected readbacks. Forward repair, code rollback and
database restoration are separate operations. Never automatically restore a
database or serve incompatible older code after a failure.

At each phase closeout, inspect dependency support and applicable advisories along
with the bounded security gates. Revisit certificate expiry, disk capacity, backups
and restore rehearsals when a real service is activated. Do not add recurring jobs
or external alert delivery until their owner, cadence and failure policy are adopted.

## Service checks after approved installation

The control plane is the `tinywarden` user service and the Debian VM client is a
system `tinywarden-agent.service`. Their service owners, files and configuration
are described in [native deployment](../deploy/native.md). On the web host, use
`systemctl --user status tinywarden.service` and bounded
`journalctl --user -u tinywarden.service -n 100 --no-pager`. On the VM, use
`systemctl status tinywarden-agent.service` and its bounded system journal.
These commands are observations; changing a unit requires an approved release or
incident action. Avoid raw request/response, environment or credential output.
Check liveness through `49.12.155.98:10007`; verify protected routes reject an
anonymous caller. Confirm database access separately with the named owner login.
For a stale host, inspect the agent unit, TLS origin and last contact timestamp;
do not interpret a running web process as a fresh agent heartbeat.

## Backup, restore and failure recovery

The P4 [data lifecycle contract](../architecture/data-lifecycle.md) owns the new
90-day observation policy and receipt-aware recovery criteria. Local implementation is verified;
live migration and automatic cleanup activation are pending; the procedures below describe existing
backup operations. Apply its post-purge compatibility rule when P4 is activated.

For schema/data-rewrite migrations, use PostgreSQL 18 `pg_dump` in custom
format for the exact `tinywarden` database, with a restricted backup file and a
recorded revision/time. `pg_dump` covers one database; it does not capture external
configuration, certificates or host agent state. Preserve those through their
separate private procedures. Check readability for each new dump. Populated restore
is required for destructive/data-rewrite or recovery-contract changes, changed
restore tooling/target, or absent applicable successful restore evidence; it is
not required for every tested compatible additive migration.
[PostgreSQL documents custom archives](https://www.postgresql.org/docs/18/app-pgdump.html)
and [single-transaction restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
When rehearsal is required, restore to an owned disposable database, with `pg_restore
--single-transaction --exit-on-error --no-owner`, using the existing `tinywarden`
login. Restrict PUBLIC connection access on the new database before restoring;
preserve the archive's schema/table ACLs and verify all three levels afterward.
Never restore over a serving database to test a backup.

Before accepting a restore, compare schema/migration versions and per-table row
counts with the source snapshot; verify operator, host, agent, credential and audit
references and check application read/login/heartbeat with synthetic or authorized
data. A count match is necessary but cannot alone prove credential usability or a
complete release recovery. Record backup location, hash, target, test time and
operator separately in private operations records. Protect dumps and remove owned disposable rehearsal targets after verification.
Backup retirement is governed separately from the 90-day online observation window
by the P4 lifecycle contract; PBS retention remains deployment-specific.

If the new code fails after migration 002, leave that additive schema in place.
Only a previously tested committed revision that accepts it may be selected for
code rollback and rebuilt in the main checkout. Keep writes quiesced while
deciding between compatible code return,
forward repair and a separately authorized restore. Do not run a destructive down
migration, silently resume traffic or re-enable a revoked credential. The first
deployment must document the exact chosen rollback revision and a verified backup
before a migration-bearing change. The direct-checkout method has no separately
deployed instant-rollback artifact.

## Observation maintenance

The [data lifecycle procedure](../architecture/data-lifecycle.md#local-implementation-and-operation)
provides a guarded preview/apply CLI. Its schema requires migration 008 and compatible
retention-aware ingestion/reads. Do not enable apply on the current live P3 schema.
The first live cleanup is a separately authorized production mutation; once it
runs, pre-retention application code cannot safely replace the receipt-aware code.
Repeated cleanup is bounded and needs no per-run dump or history export. The future
P4.C timer remains opt-in. Existing PBS backup policy is unchanged.


## Notification operation (implemented locally; activation pending)

The [notification contract](../architecture/notifications.md) owns local guarded
configuration/status, serialized dispatch, bounded retries and uncertain outcomes.
An uncertain attempt requires review; acknowledgement never means delivered and
never resends. After database restore, leave sending disabled and retire the
restored route before enabling a new one; never drain a restored mail queue.
P4.B provides the guarded CLI/capture boundary and [commands](../architecture/notifications.md#local-commands-and-accepted-implementation); P4.C packages the opt-in job. No mail job or provider connection is activated by this design.
