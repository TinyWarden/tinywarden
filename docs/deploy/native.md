# Native deployment and release

TinyWarden runs on one production host with native Node 24 and the existing
PostgreSQL 18 instance. The owner selected a single working and serving checkout at
`/home/tinywarden/tinywarden`. The web application is built and run directly from
`apps/web` there. There is no second web release directory, root installer or
containerized application deployment. The Debian 13 agent on the disposable VM is
separate host software.

`infra/systemd/tinywarden.service` is linked into the `tinywarden` account's user
systemd manager; it is not copied into a root system-unit directory. Linger is
enabled for that account, so its user manager starts at boot without an SSH login.
The unit uses `/home/tinywarden/tinywarden/apps/web` as its working directory and
binds `0.0.0.0:10007`. The existing NGINX proxy forwards
`https://neutralisp.tinywarden.com` to `http://49.12.155.98:10007`. Direct HTTP
on port 10007 is also reachable under this owner-selected binding.

The ignored, mode-0600 `apps/web/.env.production.local` holds `DATABASE_URL`,
`PUBLIC_ORIGIN`, `PORT=10007`, heartbeat defaults and the temporary
`TW_ALLOW_SHORT_OPERATOR_PASSWORD=1` setting. Do not commit it or print its contents
in logs. It does not hold the administrator password. Rotate the temporary short
password to one meeting the default policy before removing the exception.
The tracked `.env.example` documents values without credentials.

When working through a non-login automation session, set
`XDG_RUNTIME_DIR=/run/user/$(id -u)` and
`DBUS_SESSION_BUS_ADDRESS=unix:path=$XDG_RUNTIME_DIR/bus` for `systemctl --user`.
The ordinary account session can use these commands directly:

```sh
systemctl --user status tinywarden.service
systemctl --user restart tinywarden.service
journalctl --user -u tinywarden.service -n 100 --no-pager
```

The linked unit file remains in the main repository; after changing it, run
`systemctl --user daemon-reload`. Check `systemctl --user is-enabled` and
`is-active` after changes. Do not start a second web listener on port 10007.

## Direct-checkout change sequence

The [native release entry point](native-release.md) packages accepted source and
agent artifacts, plans/applies scoped upgrades and documents opt-in P4 jobs.
Its application, timers and real mail retain separate deployment authority.

### Select only the changed release steps

Start with the accepted source/artifact identity and existing phase evidence.
Owner-directed redesign, 2026-09-30: one scoped execution pass and one targeted
verification pass. This policy replaces blanket rehearsal/check requirements in
older operational guides; completed P2/P3 records remain historical evidence.
Use established commands; reusable tooling belongs to P4.C packaging. Carry forward
accepted phase evidence without repeating unchanged implementation tests.

| Change | Required release work |
| --- | --- |
| Documentation only | Update documentation; no application build or service restart. |
| Bounded SQL data change | Confirm database/role and exact target/precondition; use the owning application mutation or an authorized transaction; verify affected rows before commit and read back the result. Retain previous values/reversal where practical. No build/restart unless required. |
| Web code | Preserve compatible serving artifacts/configuration; stop, build, start and check the public application. Reinstall dependencies only when the lock/dependencies changed or the installed tree is not known to match the accepted lock. |
| Tested compatible additive schema | Capture one restricted readable dump, apply the accepted migration once and verify its ledger/expected schema plus the affected application read. Reuse applicable successful restore-method evidence. No blanket populated restore, whole-database row hashing or unrelated reference scan. |
| Destructive migration, substantial data rewrite or changed recovery/state contract | Before writes, require a specific recovery plan and populated rehearsal covering affected data/references. Repeat restore validation after tooling/target changes or when applicable successful restore evidence is absent. |
| Agent binary or unit | Add state/configuration/binary/unit recovery capture, in-place upgrade and identity/sequence/effective-unit readback. An unchanged installed agent needs only current contact confirmation. |

After a web restart, check service/listener, public HTTPS and one authenticated read.
Add one current contact/representative observation when agent delivery changed.
Repeat anonymous rejection only for authentication/origin/proxy changes; repeat
browser/layout checks only for a specific unverified rendering risk. Do not mutate
settings merely to reprove accepted phase behavior. Existing cosmetic omissions
stay nonblocking. Use owning mutation/migration boundaries; this policy does not
waive audit, authorization, constraints or required checks. Missing proof blocks acceptance.

Keep a concise release record: source/artifact identity, backup locations, executed
steps, result, interruption and any remaining issue. Tool-generated private metadata
may hold hashes/counts; avoid repeating the same evidence across narrative documents.

1. Identify accepted source/artifacts and changed components from relevant paths
   and release metadata. Select their rows above; state steps/interruption briefly.
   Do not rescan unrelated code or rediscover this host.
2. Preserve affected recovery material. Schema/data-rewrite migrations need one
   readable PostgreSQL 18 custom dump after required write quiescence. Rehearse
   only when the matrix requires it, on the existing instance with the single login.
   Preserve agent state for agent upgrades and compatible web artifacts/configuration
   for their replacement; capture modules only when replacing dependencies.
3. Execute changed steps once. Stop web before dependencies/build in its serving
   checkout, or migrations requiring quiescence. Use the explicit owner-checked
   migrator only for pending schema changes. Build/restart web only for its runtime
   changes; install/restart agent only for binary/unit changes. Preserve one checkout,
   private environment and existing identity/state; no second deployment or cluster.
4. Run selected readbacks once, record the outcome and finish. After a specific
   correction rerun only the failing check; never repeat successful release steps
   or settings changes as part of verification retries.

A failed migration, build or smoke check requires an explicit repair decision.
Migration 002 is additive and remains installed during any code-only rollback.
Only select an older revision after proving it accepts the current schema and
private agent state; rebuild it in this same checkout while the service is stopped.
There is no separately deployed code artifact for instant rollback. Never silently
restore a live database or discard an ambiguous agent credential. See the
[operations runbook](../operations/runbook.md#backup-restore-and-failure-recovery).

## Debian 13 agent installation

The installed `infra/systemd/tinywarden-agent.service` template runs a dedicated
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

P2.B updates the repository agent unit to remove PrivateTmp, ProtectHome,
ProtectSystem and ReadWritePaths so its unprivileged collector can see the
[host mount view](../architecture/disk-observations.md#agent-service-view).
A transient unit with the same view saw a separate tmpfs mount on the disposable
Debian host; the [authorized P2 upgrade](p2-live-upgrade.md) subsequently installed
the P2 unit and binary. P3's future agent release must also apply the
[execution policy's service cleanup settings](../architecture/recipe-execution.md#process-ownership-cancellation-and-bounds)
and verify root-owned native tools plus the dedicated unprivileged account.
Selecting that contract does not install or restart a service.
The [P2 single-checkout upgrade plan](p2-live-upgrade.md) records the required
backup rehearsal, migration/build sequence, VM state preservation, C01 delivery
proof and recovery decision before that change is authorized.
