# Operations

No TinyWarden service is installed yet. Proposed service:
`tinywarden.service`; proposed release root: `/srv/tinywarden`; configuration:
`/etc/tinywarden/web.env`. The service owner is an unprivileged project account;
the administrator owns service installation and PostgreSQL provisioning.

Before activation, identify the exact database cluster/role/database, reserved web
port, TLS ingress, backup storage, retention and restore procedure. Installed
PostgreSQL packages do not authorize inspecting or reusing another application's
database. Never reuse the historical development password in production.

Document the actual approved start/stop/restart and bounded log/health commands
when the service exists. Health must distinguish liveness, dependencies and stale
host observations. Until then, validate only task-owned loopback processes and stop
them by their captured process identity. Do not probe unrelated application resources.

Before migration-bearing releases: quiesce required writes, drain bounded work,
verify a restorable backup, stage the exact revision, migrate once, restart that
revision, run safe smoke checks and then resume. Forward repair, code rollback and
database restoration are separate operations. Never automatically restore a
database or serve incompatible older code after a failure.

At each phase closeout, inspect dependency support and applicable advisories along
with the bounded security gates. Revisit certificate expiry, disk capacity, backups
and restore rehearsals when a real service is activated. Do not add recurring jobs
or external alert delivery until their owner, cadence and failure policy are adopted.

## Service checks after approved installation

The control plane is `tinywarden.service` and the Debian host client is
`tinywarden-agent.service`. Their service owners, files, accounts and configuration
are described in [native deployment](../deploy/native.md). The service administrator
uses `systemctl status tinywarden.service` or `systemctl status
tinywarden-agent.service` and bounded `journalctl -u <unit> -n 100 --no-pager` output.
These commands are observations; changing a unit requires an approved release or
incident action. Avoid raw request/response, environment or credential output.
Check local liveness through `127.0.0.1:10007`; verify protected routes reject an
anonymous caller. Confirm database access separately with the named owner login.
For a stale host, inspect the agent unit, TLS origin and last contact timestamp;
do not interpret a running web process as a fresh agent heartbeat.

## Backup, restore and failure recovery

For a quiesced migration-bearing release, use PostgreSQL 18 `pg_dump` in custom
format for the exact `tinywarden` database, with a restricted backup file and a
recorded revision/time. `pg_dump` covers one database; it does not capture external
configuration, certificates or host agent state. Preserve those through their
separate private procedures. [PostgreSQL documents custom archives](https://www.postgresql.org/docs/18/app-pgdump.html)
and [single-transaction restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
Restore a copy to a newly created disposable database, with `pg_restore
--single-transaction --exit-on-error --no-owner`, using the existing `tinywarden`
login. Restrict PUBLIC connection access on the new database before restoring;
preserve the archive's schema/table ACLs and verify all three levels afterward.
Never restore over a serving database to test a backup.

Before accepting a restore, compare schema/migration versions and per-table row
counts with the source snapshot; verify operator, host, agent, credential and audit
references and check application read/login/heartbeat with synthetic or authorized
data. A count match is necessary but cannot alone prove credential usability or a
complete release recovery. Record backup location, hash, target, test time and
operator separately in private operations records. Protect and expire both dumps
and restored databases according to the adopted retention policy; P4 defines the
long-term policy before broad release.

If the new code fails after migration 002, leave that additive schema in place.
Only a previously tested committed revision that accepts it may be selected for
code rollback. Keep writes quiesced while deciding between compatible code return,
forward repair and a separately authorized restore. Do not run a destructive down
migration, silently resume traffic or re-enable a revoked credential. The first
deployment must document the exact chosen rollback revision and a verified backup
before activation.
