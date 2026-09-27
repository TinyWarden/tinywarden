# Operations

No TinyWarden service is installed by this scaffold. Proposed service:
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
