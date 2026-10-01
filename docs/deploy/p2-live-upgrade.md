# P2 single-checkout upgrade and recovery record

Prepared and executed 2026-09-29 with the owner's explicit live-upgrade
authority. The restricted online backup, populated restore rehearsal, fresh
stopped-service dump, live migrations, serving-checkout build, VM agent upgrade
and temporary audited C01 edits are recorded below. Commit, push and GitHub
publication are separate, unauthorised actions. The owner selected one working
and serving checkout; no second web instance was started. The owner
confirmed that PBS backups already run. Keep the local upgrade backup in a
fresh timestamped directory under
`/home/tinywarden/backups`, outside both repositories, owned by `tinywarden`
and mode 0700; backup files are mode 0600. This local copy supports immediate
upgrade recovery, and PBS remains the owner's separate server backup. PBS
coverage was owner-reported, not independently verified by this plan.

## Verified pre-upgrade baseline and pre-stop rehearsal

- Before the upgrade, the `tinywarden` user service was active and enabled.
  At the final pre-stop check it was running as PID 531449, with an all-interface
  listener on port 10007. The repository HEAD was
  `4b466a9e0a5417263271d5ef17a365615647fd58`; the serving `.next/BUILD_ID`
  file had SHA-256
  `6a714c4a2e86c998681aa6cfb353d6e1b03698925b9cb3fef25c8ba039539a6c`.
  PostgreSQL 18.6 serves the live `tinywarden` database through the existing
  local socket. Database and schema owner, session user and current user are all
  `tinywarden`. The live database then had only `001_initial` and
  `002_audit_target_agent`: one operator, login throttle, session, host, agent,
  credential and enrollment token; eight audit events; one unrevoked credential;
  no invalid foreign keys. Its measured size was 8,877,759 bytes. No P2 tables
  were present after the rehearsal. The web service remained active throughout.
- Before the upgrade, the disposable Debian 13 VM's `tinywarden-agent.service`
  was active and used
  `/etc/systemd/system/tinywarden-agent.service`, and runs as `tinywarden-agent`.
  Its installed binary is SHA-256
  `8dbd0e9d5c6994b0dfea2e29de416c2c44caf756f58456ae5928267c7333fdb0`.
  `/var/lib/tinywarden-agent` was mode 0700 and its `state.json` was owned by that
  account, mode 0600. The installed P1 unit enabled PrivateTmp,
  ProtectHome and ProtectSystem with a ReadWritePaths exception.
- A PostgreSQL 18 custom-format archive of the guarded test database was
  restored with `--single-transaction --exit-on-error --no-owner` into a newly
  created disposable database on the existing instance. Source and restore
  counts matched for migrations/audit/definition revisions/runs/recovery markers
  (`5|1|1|0|0`), the restored ledger had 001–005, and PUBLIC CONNECT was revoked.
  The archive SHA-256 was `7a90881ae5f5bc742d22cfd3d0a2826e9c2829e203f785514fd6acfa1dcf1e1b`.
  The disposable database and archive were removed. This established the
  procedure on synthetic data before the populated rehearsal below.
- The owner-authorized online `pg_dump -Fc` produced
  [`tinywarden-prestop.dump`](/home/tinywarden/backups/p2-prestop-20260929T084015Z-MFjcqX/tinywarden-prestop.dump)
  in a mode-0700 directory. The 34,006-byte archive is mode 0600, owned by
  `tinywarden`, and has SHA-256
  `04d0fadc7d41e5462c5150ce00180980d30c66be2a3c3718ae6f13b7def128df`.
  The online dump took 82 ms. The first attempt used TCP instead of the
  configured Unix socket and failed authentication before producing a usable archive;
  no clone or live schema action followed that failed attempt.
- A unique database owned by `tinywarden` was created on the existing instance
  from template0, then had PUBLIC CONNECT revoked before restore. Clone creation
  and revocation took 54 ms. `pg_restore --single-transaction --exit-on-error
  --no-owner` took 57 ms. The restored P1 row counts and 001/002 ledger matched
  the live database exactly, including eight audit events; core references,
  validated foreign keys, ownership and PUBLIC access checks passed.
  Guarded migrations 003–005 on the clone took 315 ms and left every P1 count
  intact. The ledger became exactly 001–005, with one 85/95/300 definition and
  revision, one initialization audit (nine total), no runs or recovery markers,
  no public table grants and no invalid foreign keys. A second migration run
  added nothing. The live ledger stayed at 001/002 with eight audit events and
  no P2 tables. The clone was dropped in 60 ms; the archive remains restricted.
  Preparation from backup directory creation to final archive/service check
  took 5 minutes 23 seconds, including inspection and the authentication retry.

## Measured web outage components

| Step after service stop | Measured result |
| --- | --- |
| Capture old serving artifacts and fresh final dump | The 637,808,640-byte old-serving archive took 0.444 s; the fresh 34,008-byte custom-format dump and TOC/hash verification took 105 ms. |
| Apply migrations 003–005 to live | 0.318 s; the ledger became exactly 001–005, with P1 counts intact, one 85/95/300 seed and one initialization audit. |
| Install locked dependencies and produce the production build | `npm ci` took 7.004 s for 317 packages; the Next production build took 6.226 s and compiled the new agent/check routes. |
| Restart, login, policy read, proxy and heartbeat smoke checks | Service stop-to-start elapsed 2 min 35 s, including manual guards and archive checks. Public HTTPS and authenticated Fleet/policy checks passed after start. The existing P1 agent's first new heartbeat arrived 3 min 26 s later because it entered its documented 300–330 s outage backoff. |

The web service was stopped at 08:52:58 UTC and started at 08:55:33 UTC. It was
then active on port 10007. The persistent VM agent upgrade began only after a
new heartbeat confirmed that the site was serving. These are measurements for
this small database and installed dependency cache, not a future outage bound.

## Before the service stop

1. Review the exact P1/P2 working-tree snapshot, including new files, generated
   map and dependency locks. Record its content hash, tool versions, the running
   web process identity and the VM binary/unit hashes. Keep the approved snapshot
   fixed through the upgrade. Confirm the web and VM services are active, the
   live ledger is still 001/002, the single host and credential are as expected, and
   the agent state is privately backed up without printing its contents.
2. Recheck the retained archive hash, mode and restricted directory and compare
   current live P1 counts, ownership and ledger with the populated rehearsal.
   If material data or schema changed, repeat an online clone rehearsal before
   stopping web. Confirm free backup space and PostgreSQL 18 tools. Record the
   current private web config, package lock, `.next` output and `node_modules`
   as recovery inputs with their permissions. These are artifacts, never a
   second running web deployment.
3. Run safe source, test, audit and unit checks recorded in
   [P2 acceptance](../development/p2-acceptance.md). Production `npm ci` and
   `next build` remain pending because the service uses this checkout. Confirm
   the exact old `.next` output and modules can be restored if the new build
   fails. Set the outage window from the still-unmeasured `npm ci`, production
   build and web smoke time; the subsecond database rehearsal is not a reliable
   bound for those steps. Record the actual outage and choose repair or P1
   restart if the window becomes insufficient. The agent will buffer bounded
   runs while web is down.

## Authorized web window

1. Stop `tinywarden.service` through the `tinywarden` user manager, using the
   documented `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS`. Confirm port
   10007 has no TinyWarden listener. Keep traffic quiesced until the smoke checks
   pass. Capture the stopped checkout's private config, `.next`, modules and lock
   as restricted recovery artifacts without moving their serving paths.
2. Make a **fresh final** PostgreSQL 18 `pg_dump -Fc` of only the live
   `tinywarden` database into a distinct mode-0600 archive in the restricted
   backup directory. Verify its hash, custom-format TOC, source ledger, P1 counts
   and owner without printing credentials or raw rows. Keep both archives under
   the approved retention procedure. If the final dump or comparison fails,
   restart the unchanged P1 web service and defer migration. The completed
   online populated restore is the rehearsal; a second clone restore is not
   part of the ordinary outage path. A Git revision is not a database backup.
3. Apply the guarded migration CLI to the live `tinywarden` database while
   the web service remains stopped. Supply `DATABASE_URL` from the private
   `.env.production.local` through Node's `--env-file` support, for example from
   `apps/web`: `node --env-file=.env.production.local --import tsx
   server/db/migrate.ts tinywarden`. Confirm the ledger is exactly 001–005 and
   P1 row counts/references are unchanged. Migration 003 seeds one definition
   revision and one system audit event; migration 004 adds run tables; migration
   005 adds generation-scoped recovery markers. All three are additive and refuse
   destructive down migration.
4. Run `npm ci --no-audit --no-fund` and the production Next build in the stopped
   serving checkout, then check the build artifact. Reload the user manager if
   the linked web unit changed, start `tinywarden.service` and confirm active/
   enabled state, port 10007, public HTTPS proxy, protected-route rejection,
   operator login, Fleet policy read and P1 heartbeat. A process running without
   fresh agent contact is not sufficient. Record the source/archive/build hashes
   and service journal window.

## Authorized VM agent window and C01 proof

1. After web smoke checks pass, record the VM's host/agent ID and generation
   through authorized operator read access. Preserve its private state directory
   and current installed binary/unit as restricted recovery artifacts. Transfer
   the reviewed P2 binary to a temporary root-owned path on the VM and verify its
   hash. Stop only `tinywarden-agent.service`; do not re-enroll or replace its
   credential. Atomically install the binary and the reviewed unit from
   `infra/systemd/tinywarden-agent.service`, run system `daemon-reload`, and
   start the unit. Confirm the installed unit has the host mount view and retains
   the unprivileged account, state permissions, NoNewPrivileges and UMask.
2. Confirm the same host ID, agent ID and generation, continuing heartbeat, an
   assignment with ready `disk_usage.v1`, and a complete run with local/tmpfs
   mount detail. Confirm there is no current-generation recovery marker before
   beginning C01 edits. If one is present, stop the proof and use explicit
   credential replacement after investigating its first reason; known=null,
   heartbeat and policy edits cannot clear it. Record any unknown coverage
   rather than calling it healthy.
3. With the owner's approved temporary threshold values, record the current
   default and host policy. For the baseline 85/95/300, use global 84/95/300,
   then a complete host override 83/95/300. While that override is active,
   change the global default again to 82/95/300 and verify the host still
   receives 83/95/300 from its pinned override. Return the host to inherit and
   verify it receives 82/95/300; restart the same agent binary and verify the
   inherited source persists. Verify each delivery's revision, digest, source
   mode and values, and confirm old run history retains its original snapshot
   and classification. Restore the original global 85/95/300 through an audited
   edit and verify final inheritance. If actual starting values differ, select
   and record valid temporary tuples before editing; do not assume these example
   values are safe.

## Executed live evidence

- A mode-0700 directory at
  `/home/tinywarden/backups/p2-live-upgrade-20260929T085154Z-11X9RI` holds the
  reviewed working-tree patch (SHA-256 `4c72a5fc46367bf8e6cad78d1abb66c4ead3fc9530f935f3105aebc15e351e9d`),
  stopped P1 `.next`/modules/config/lock archive (mode 0600, SHA-256
  `9fd15c62ef1ad0aa88ad07b4565258428ca872853a87d673139ceea065f42620`),
  and the fresh final P1 database archive (mode 0600, SHA-256
  `98909f368c95604a120d0499e95562c01cf0af1e422fe2e22c8d3fa2de2a2718`).
  The final archive's TOC and P1 counts/owner/001–002 ledger passed before
  migration. No live database restore or down migration was needed.
- The migrated live database had one operator, session, host, agent, credential
  and token, exactly one definition and revision at 85/95/300, one added system
  audit and no runs or recovery markers before P2 agent activation. The new
  production `.next/BUILD_ID` SHA-256 is
  `395a5741f36439f916acf2143e01a2b3a58b7f1b2f95ba84f5246cbe7e7927bd`.
  Public `/` and `/login` returned 200, protected Fleet redirected to login,
  and unauthenticated operator APIs returned 401. A short-lived operator login
  checked session, hosts, definition and Fleet at 200 and logged out at 204.
- The old VM state/binary/unit/config are preserved in root-owned mode-0600
  `/var/backups/tinywarden-p2-20260929T0900-ZTQNy8OC/old-agent.tar` and an
  encrypted-SSH local copy in the restricted upgrade directory. Both have
  SHA-256 `1cc3abdfd43416fae4199ad6105759cded82eae0cc4f554b4c74135167f619d7`.
  The agent stopped at 09:00:53 UTC and started at 09:01:38 UTC with the same
  host/agent IDs and generation 1. The installed P2 binary SHA-256 is
  `d4e6a23398b6ae99920d8e8e85d47552ad6d693eb63ca9bb9671c5aa8b1502dc`;
  the unit SHA-256 is
  `3a66cf8f349c1e21034b361f32903b322a06b92e2a0ab459701af5fd33b11d6e`.
  The unit runs as `tinywarden-agent`, exposes host mounts, and retains UMask
  0077 and NoNewPrivileges. Heartbeat sequence 684, ready assignment revision 1
  and a complete healthy run with ext4, tmpfs and vfat mounts arrived immediately.
- C01 delivered assignment revisions 1–5 to the actual agent, with warning
  thresholds 85 inherited, 84 inherited, 83 overridden, 82 inherited, then
  restored 85 inherited; critical threshold 95 and interval 300 stayed fixed.
  The override was pinned to definition revision 2. While it was active, global
  revision 2→3 changed the default to 82 but the next agent poll renewed the
  same revision-3 assignment ID/digest and 83 effective threshold; no new
  snapshot appeared. Reset-to-inherit created policy version 2 and delivered
  82. A restart of the same binary retained its revision-4 ID/digest and
  generation, renewed the assignment and continued heartbeat and runs. The
  final global edit restored 85 and delivered revision 5. All five agent
  digests matched immutable server snapshots. Audit contains one initialization,
  three global edits and two host-policy edits; the original run remains healthy
  under its immutable 85/95 snapshot. The next scheduled run, sequence 4,
  arrived at 09:12:08 UTC with complete coverage under revision 5; the
  authenticated host page returned 200 and server-derived current disk health
  was healthy with four immutable history rows. No recovery marker was created.
  The approved operator sessions logged out after each edit.
- After the live build, the guarded web suite passed 65/65 tests in 13 files.
  Web lint, no-write TypeScript, Go race tests/vet/module verification/build,
  source/map/localization/unit checks and whitespace checks passed. `npm audit`
  found zero vulnerabilities and `govulncheck` found none. A temporary-index
  Gitleaks scan found no leaks in all 154 final working-tree paths. Commit, push,
  GitHub checks and publication remain outside this live-upgrade authority.

## Failure and rollback decision

Before any live migration, the online populated restore rehearsal and fresh
stopped-service archive must pass. If the final dump fails, restart unchanged P1
web and defer. If the live migration fails, keep web stopped and decide on
forward repair using the recorded error. Do not run a destructive down migration. If
the new build or web smoke check fails after additive 003–005, restore the
preserved P1 `.next` and compatible modules in this same checkout and restart
the old service only after verifying it accepts the migrated schema. The old P1
web code ignores P2 tables; it cannot expose P2 controls or claim P2 delivery.
Keep the database archive for a separate, explicitly authorized restore decision.
Preserve every recovery marker across code rollback. If the database itself is
restored to an earlier snapshot, P2 agents retain their saved known revision and
will latch a current-generation regression instead of silently using old policy.

If the VM P2 binary/unit fails, stop that unit, restore the exact saved installed
binary/unit and reload/start it only after confirming the old binary still reads
the **current** strict `state.json`. Do not restore an older state file, reset the
heartbeat or run sequence, delete queued P2 runs, copy enrollment state to another
host, or silently re-enroll. P2 assignment and disk files are separate from P1
identity state; retain them for recovery with a compatible P2 binary. If a live
credential or schema compatibility check cannot pass, leave the affected service
stopped and choose explicit forward repair or a separately authorized database
restore while preserving ambiguous agent state.
