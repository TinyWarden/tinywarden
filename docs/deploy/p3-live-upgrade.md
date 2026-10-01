# P3 single-checkout live upgrade

Prepared 2026-09-30. This is a reviewable release procedure, not authority to
execute it. P3.C local implementation, disposable VM proof, phase checks and
mandatory final review are accepted. Obtain explicit owner authority for the web
migration/build/restart and VM agent upgrade before executing this procedure.
Commit, push and GitHub checks remain separate. The existing main checkout at
`/home/tinywarden/tinywarden` stays the only product source/service directory.
The application remains `0.0.0.0:10007` behind `neutralisp.tinywarden.com`.

Executed 2026-09-30 after the owner authorized “deploy p3”. Populated rehearsal,
live migration/build/restart, installed VM binary/unit upgrade and live acceptance
passed; see the [release record](../development/p3-acceptance.md#live-deployment-acceptance).
Web interruption was 14.83 seconds and VM agent interruption 0.82 seconds.
Restricted recovery artifacts remain retained. This records authority for that
completed release; future live changes retain their own approval gate.

## Before stopping the service

1. Fix and record the exact reviewed owned-source snapshot, package lock,
   unit/config identities and final agent build hash. Reconcile active/enabled
   `tinywarden` user service, public login, live PostgreSQL 18 owner/target/ledger
   001–005 and existing VM agent contact. Use the existing single `tinywarden`
   database login and reserved SSH key; do not create roles or another cluster.
2. Prepare a fresh mode-0700 directory under `/home/tinywarden/backups`; archives
   are mode 0600 and outside both repositories. The owner reports PBS coverage.
   Retain a custom-format online live dump and rehearse a single-transaction restore
   plus additive 006/007 migration on a unique disposable database on the existing
   instance. Verify P1/P2 counts, core references, disk definitions/snapshots/runs,
   audit and 001–005 before migration, then exact 001–007, three baseline seeds
   and initialization audits, no dangling references and idempotent second migrate.
   Drop only that owned rehearsal database. This populated live rehearsal is a
   release readiness action and was not claimed by the synthetic P3.C tests.
3. Preserve old serving `.next`, modules/lock, private configuration and unit as
   restricted recovery artifacts. Preserve the installed VM binary/unit/config and
   complete private state directory without printing credentials. Check archive
   readability/hash/modes and free space. Do not start a second web deployment.
4. Report the planned short stop/build/start window and choose repair/restart if
   it becomes insufficient. P2 measured a 2m35s web outage with subsecond migration
   and a six-second build; those measurements are not a new fixed outage bound.
   Agents retain bounded work and may enter their documented outage backoff.

## Approved web and agent window

1. Stop `tinywarden` through the linger-backed user manager. Supply
   `XDG_RUNTIME_DIR=/run/user/1020` and
   `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1020/bus` for this account.
   Confirm no TinyWarden listener remains on 10007. Capture a fresh final
   `pg_dump -Fc` of only `tinywarden` in the restricted directory and compare
   ledger/counts/ownership with the rehearsal. If capture/readback fails, restart
   unchanged serving artifacts and defer migration.
2. From `apps/web`, run the existing explicit owner-checked migrator:
   `node --env-file=.env.production.local --import tsx server/db/migrate.ts tinywarden`.
   It uses the private runtime URL without printing it. Confirm 001–007, unchanged
   P1/P2 references/history and three baseline seed revisions. Migrations 006/007
   add baseline definitions/policies/delivery/receipts/runs/recovery and typed audit
   columns; all 001–005 files and disk contracts remain unchanged.
3. Run locked `npm ci --no-audit --no-fund` and `npm run build` while stopped.
   Start the same user service from the same directory. Confirm active/enabled,
   all-interface 10007 listener, public TLS/login, unauthenticated rejection,
   authenticated Fleet/defaults and continued existing agent heartbeat/disk.
   A P2 agent without the baseline capability must not appear healthy for baselines.
4. Build the reviewed agent, stop only the disposable VM's existing agent unit,
   back up current private state, and install the root-owned executable in place.
   Install the reviewed `infra/systemd/tinywarden-agent.service` as the existing
   system unit, preserving the dedicated non-root account, configuration, state
   directory, saved SSH key and existing host/agent/generation. Validate unit
   syntax and run `sudo systemctl daemon-reload` before starting it. Read back
   `sudo systemctl show tinywarden-agent --property=User,Group,NoNewPrivileges,KillMode,SendSIGKILL,TimeoutStopUSec,Restart`:
   require `User=tinywarden-agent`, `Group=tinywarden-agent`,
   `NoNewPrivileges=yes`, `KillMode=control-group`, `SendSIGKILL=yes`,
   `TimeoutStopUSec=5s` and `Restart=on-abnormal`. Stop the upgrade if they differ.
   Start the existing unit. Do not reenroll, reset sequence or delete ambiguous files. Check
   active/enabled, fresh heartbeat, disk continuity and three delivered baseline
   snapshots followed by typed observations. Record binary/source hashes and
   measured stop-to-start intervals.
5. Verify public desktop/narrow history and settings against that host. Cached
   zero APT plan, marker absence and missing fstrim history must remain qualified
   unknown; a present marker remains attention. A temporary audited APT simulation
   mode edit may prove same-binary source revision delivery, then restore it.
   Preserve old recipe history and independently recheck restored desired/delivered
   state. Never refresh APT indexes, upgrade packages, run trim or reboot as proof.

## Recovery and completion

If build/start fails, restore the saved serving modules/lock/`.next` and unit/config
in the same checkout and restart the prior P2 artifact; do not run a second source
directory. Additive baseline tables may remain when using that prior artifact.
P3.C synthetic compatibility tests do not by themselves prove a populated live
rollback; the rehearsal/readback above remains required. Restore the prior VM
binary/unit without deleting new private baseline files if the agent upgrade fails.
Record the failure and resume reviewed forward repair. Refuse destructive down
migrations; `006`/`007` intentionally fail on downgrade.

A database restore is a separately authorized destructive recovery. Quiesce web
and agent writes, keep the failed state privately, restore the exact reviewed
archive with `--single-transaction --exit-on-error`, revalidate owner/ledger/core
references and match serving artifacts to schema. Restored lost assignment identity
commits a generation recovery latch when retained client hints/results appear;
empty-cache fetch cannot clear it. Use explicit credential replacement and fresh
baseline/disk delivery/results to recover authority. Do not delete local state or
reissue old results under a new generation. P4 owns a broader recovery/retention
contract; this release does not invent automated restore or cleanup.

Acceptance requires recorded final ledger, fresh contact/disk and baseline evidence,
public UI, restored central setting, service identities, artifact hashes and recovery
archive paths/modes. Keep restricted local backups for immediate recovery/PBS.
Update the master plan/private evidence only for actions actually executed. Local
P3 completion and live release acceptance are separate recorded outcomes.
