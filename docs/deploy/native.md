# Native deployment and release

TinyWarden targets a single Linux host with native Node 24 and PostgreSQL 18.
No container engine is required. P1.B access/enrollment and P1.C heartbeat/fleet
source are implemented locally; P1.D adds replacement, revocation and recovery.
Live service readiness requires the exact-release checks below.
Tests use a dedicated synthetic database
on the existing PostgreSQL instance. Live application database provisioning and
persistent service activation retain their deployment gates.

`infra/systemd/tinywarden.service` is an administrator-reviewed system-unit template.
It runs as an unprivileged `tinywarden` identity against an immutable release under
`/srv/tinywarden/current`. This is a proposed release path, not the source checkout.
Resolve that path and its permissions before installing the unit. The template
resolves Node through `/usr/bin/env` with the unit's explicit system-only PATH;
verify the selected supported runtime and filesystem permissions on the target.

The private `/etc/tinywarden/web.env` must provide `PORT=10007` and later the
validated application configuration. The owner has configured NGINX to proxy the
first hostname to this loopback port. Never put secrets into the template. The
web server binds to loopback; a separately adopted TLS reverse proxy owns exposure.
`ProtectHome=true` intentionally requires the release outside a home checkout.
Only `.next` runtime cache is writable under the release; verify this against the
selected runtime before activation. A successful unit parse is not service readiness.

| Configuration | Consumer | Required/default | Failure/impact |
| --- | --- | --- | --- |
| `NEXT_TELEMETRY_DISABLED` | Next tooling | `1` in project commands | Tool telemetry stays disabled. |
| `PORT` | Next server | `10007` for the first instance; CLI default 3000 only for unrelated loopback smoke | Conflict prevents startup; never kill an unrelated listener. |
| `NODE_ENV` | Node/Next | `production` in system unit | Build/runtime behavior must match release. |
| Database credentials/origin | P1 application boundary | Required for P1.B API requests; static page/build do not connect | Follow the selected [P1 configuration contract](configuration.md); do not reuse historical example credentials. |

P1 selects a dedicated database/schema owned by the single `tinywarden` PostgreSQL
login, shared by explicit migrations and application access. The
[data contract](../architecture/data.md#postgresql-ownership-and-test-targets) records
its permissions and database-owner audit limitations. One local application
administrator is initialized through a hidden local prompt. Public traffic
requires the origin, TLS proxy and bounded requests defined in the configuration
contract. The first hostname and upstream port are fixed above. Native database and
service provisioning remain deployment gates; they do not block implementing against
the reserved test database.
Testing reuses the existing PostgreSQL service; do not start additional clusters.

Before first activation: reserve resources, verify database ownership and the single
`tinywarden` login, settle authentication/TLS, validate configuration, build an exact verified
revision, establish backup/restore and a compatible rollback path. An administrator
installs/starts the unit only after explicit deployment authority.

After serving traffic, build in an isolated checkout on the same host and deploy
immutable release artifacts. Do not run builds, broad cache cleanup or destructive
tests in the live serving checkout. A future dev/prod split is a planned operations
change, not a prerequisite for scaffold work.

## Control-plane release sequence

1. Select an exact committed application revision that passed the phase gate and
   review; record its commit and matching dependency lock. Verify the actual proxy
   configuration and certificate on the host that serves
   `https://neutralisp.tinywarden.com`, its upstream `127.0.0.1:10007`, and that the
   loopback port is free or belongs to the recorded TinyWarden service. The local
   NGINX files currently inspected do not show that upstream, so check the proxy's
   true location before declaring public readiness.
2. Provision only the reserved `tinywarden` database/schema on the existing
   PostgreSQL instance, owned by the existing `tinywarden` login. Verify exact
   database, current/session role and owner. Stage the source/bundle under
   `/srv/tinywarden/releases/<exact-commit>` in an isolated build location; never
   build in a directory serving traffic. Make source and dependencies read-only to
   the service identity. Verify Node 24 and the systemd unit's system PATH. The
   `.next` cache is the one writable release subtree required by the current unit;
   keep it release-specific, never shared across revisions.
3. Store `DATABASE_URL`, `PUBLIC_ORIGIN`, `PORT=10007` and heartbeat defaults in
   root-managed `/etc/tinywarden/web.env`, with access limited to service setup.
   Keep credentials out of release files, commands, shell history and logs. Validate
   the [configuration contract](configuration.md) before accepting traffic. Run
   `operator-init` through its hidden terminal prompt only once, after migration.
4. Quiesce writes for a migration-bearing upgrade and drain requests within the
   service timeout. Create a PostgreSQL 18 custom-format backup of the exact database
   and verify it by restoring to a new disposable database on the same existing
   instance. Reconcile owner, migration ledger, table counts and sample referential
   integrity without exporting raw records. Store the real backup in restricted
   storage with an operator-defined retention and recovery location. A current
   unverified dump is not a completed recovery plan.
5. Run the explicit owner-checked migration command once, with the expected database
   name, against that exact target. For this release, migration 002 adds the nullable
   audit target FK/index. Confirm both `001_initial` and `002_audit_target_agent` in
   the ledger. Switch `/srv/tinywarden/current` atomically to the staged revision,
   then start or restart `tinywarden.service` using the service administrator.
6. Check the process on `127.0.0.1:10007`, anonymous protected-route denial,
   authenticated operator login/fleet read, agent TLS heartbeat and the public
   hostname through the actual proxy. Check the audit/host/agent counts after the
   smoke journey. Treat contact state as separate from service liveness. Resume
   traffic only after the exact revision and checks are confirmed.

On migration, startup or smoke failure, keep writes quiesced and record the failed
revision and last successful step. Migration 002 is additive; it remains installed
during any code-only rollback. Roll back code only to a separately verified,
compatible committed release. The current uncommitted P1.D draft is not a rollback
candidate. Do not drop the audit target column to roll back; use a reviewed forward
repair or an explicitly authorized database restore. See the
[operations runbook](../operations/runbook.md#backup-restore-and-failure-recovery).

## Debian 13 agent installation

The uninstalled `infra/systemd/tinywarden-agent.service` template runs a dedicated
`tinywarden-agent` account. Install a reviewed agent binary at
`/usr/local/bin/tinywarden-agent`, create `/var/lib/tinywarden-agent` owned by that
account with mode 0700, and install a root-managed, non-secret JSON config at
`/etc/tinywarden-agent/agent.json`. Its `state_dir` must be that private directory;
its `control_plane_origin` must be the validated public HTTPS origin. Never copy an
enrolled state file between hosts or into a VM template.

After an operator issues a one-use token, transfer it through a private channel to
a mode-0600 file owned by the agent account. Run the one-shot `enroll` command as
that account, remove the token file after confirmed success, then enable/start the
agent unit. If enrollment's response is uncertain, retain its state and token; `run`
retries the saved request. The agent normally handles transient 429/5xx/network
outages internally and resumes with the same pending identity. The unit does not
restart ordinary terminal exits, which require operator review.

For replacement, issue a token bound to the existing active agent, stop its unit,
run `replace --config ... --token-file ...` as that same account and restart the unit.
The state lock prevents simultaneous `run` and `replace`; an uncertain replacement
remains in private state and the next `run` retries it. Confirm host/agent IDs are
unchanged, generation advanced once, and the next heartbeat starts at sequence 1.
For terminal revocation, the old state has no authority; rejoining requires an
explicit new-host enrollment and a new private state directory. Do not delete old
state as an automatic recovery action.

Before an agent code rollback, verify the target binary's state reader against the
actual saved format. A binary predating the pending agent_version field rejects
expanded enrollment/replacement state. Keep a compatible binary available to finish
recovery; never strip fields, restore an older sequence or discard an ambiguous
credential to make a downgrade start. The [agent persistence contract](../architecture/agent-protocol.md#client-persistence-scheduling-and-failures)
owns the upgrade and replay rules.
