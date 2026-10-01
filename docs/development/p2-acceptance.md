# P2 acceptance

P2.1 design selected 2026-09-29. The
[definition contract](../architecture/check-definitions.md) and
[observation contract](../architecture/disk-observations.md) own behavior.
P2.A implements A01–A08 and P2.B implements B01–B05. P2.C's C01 live
delivery and C02 recovery proof pass. The owner-approved single-checkout live
upgrade and post-upgrade local gates are complete; separate GitHub publication
remains. Use the existing PostgreSQL instance and guarded test database.

## Required implementation evidence

| ID | Batch | Proof |
| --- | --- | --- |
| A01 | P2.A | Additive populated-P1 migration preserves login, hosts, credentials, heartbeat and audit; seed once; failed migration/mutation rolls back all rows/audit; composite FKs and tuple bounds reject inconsistent records. |
| A02 | P2.A | Inherited host fetch advances after global edit; explicit override keeps complete values/snapshot; equal-value override changes provenance; true no-op does not advance; return-to-inherit uses the checked current default. |
| A03 | P2.A | Concurrent global editors yield one success/one revision_conflict; concurrent fetches yield one snapshot; held-lock tests recheck expired sessions, revoked/replaced credentials and clock bounds. No conflicting lock order with P1 paths. |
| A04 | P2.A | Exact mutation replay after later edits returns its original receipt; changed UUID reuse conflicts; no-op replay stays a no-op; failed audit never publishes a revision. Unauthorized/cross-origin edits and unknown-field input fail. |
| A05 | P2.A | Payload omitted only for exact known ID/revision/digest; no cache requests full payload; digest verifies ready and unsupported responses; older/reordered responses cannot replace cache; equal-revision mismatch and server regression fail visibly. |
| A06 | P2.A | Debian13/amd64/capability applicability, unknown capability and request bounds; agent never advertises the unimplemented collector. Existing P1 agent still heartbeats with the updated server. New agent tolerates assignment endpoint absence without losing heartbeat. |
| A07 | P2.A | Assignment cache atomicity/scope across restart, corruption and replacement; no mutation of strict P1 identity schema; config failures/backoff do not starve heartbeat or discard its pending replay. |
| A08 | P2.A | English-catalog global/host forms: keyboard/narrow view, inherited vs override indication, effective vs delivered values, dirty/conflict/error/loading states; late responses preserve draft and stale saved revision cannot silently overwrite. |
| B01 | P2.B | Local/tmpfs/read-only/pseudo/network/bind/unknown mounts, escaped paths, inaccessible/disappeared mounts and topology change; overflow produces incomplete/unknown; actual VM collector sees host view, including a separate local mount outside `/`. |
| B02 | P2.B | Exact threshold boundaries with reserved blocks, large uint64 values, invalid counters and display rounding; historical run classification survives default/override edits. |
| B03 | P2.B | Same and changed duplicate runs, concurrent retry, wrong-host snapshot, old generation, sequence conflict and out-of-order completion; audit/transaction failures cannot produce partial records. |
| B04 | P2.B | First/no/failed/stale/clock-uncertain/obsolete evidence never healthy; newest failed run defeats older healthy result; contact and disk health remain separate; UTC/grace equality boundaries use frozen clocks. |
| B05 | P2.B | Collector timeout/output cap leaves heartbeat responsive; one blocked helper maximum; stop cleans up owned children. Queue/restart crash boundaries retain exact in-flight input and monotonic run sequence. |
| C01 | P2.C | On approved disposable Debian host, central inherited threshold update arrives without binary update; explicit override holds; return to inherit and restart retain correct provenance; old history unchanged. |
| C02 | P2.C | Outage/reconnect, 24-hour cache lease, bounded queue/drop count, delayed/stale uploads, response reordering and database rollback/regression paths; no false fresh evidence or silently lost authority state. |
| C03 | P2.C | Complete local phase gate, release/upgrade evidence, applicable authorized GitHub checks and security/dependency checks; reconcile documents, map and evidence before phase completion. |

## P2.1 design trace review

These are contract-level traces, not executable proof:

1. Default D1 → inherited snapshot S1 → D2 → S2: old run stays on S1;
   current health waits for S2. Override policy V1 pinned to D1 remains unchanged.
2. Equal-value override creates V1 despite equal numbers. Editing the same override
   is a no-op; reset creates V2/inherit. Global edit between GET and reset causes
   conflict through expected_default_revision.
3. Operator A locks the definition, publishes D2+audit+receipt atomically. A second
   stale editor sees conflict. An exact lost-response retry returns its D2 receipt
   even after D3 exists; changing that retry's values conflicts.
4. Two fetches serialize through host/policy and reuse one source snapshot. A
   revocation/replacement either precedes authorization (deny) or follows a valid
   fetch (old-generation cache is then unusable). No reverse definition lock in P1.
5. Same cached ID/revision/digest permits omission; absent cache gets full data.
   Server revision below known revision pauses instead of restoring old settings.
6. Missing capability yields explicit unknown with a verifiable digest. The real
   P2.A binary retains heartbeat while its collector is absent.
7. A disappearing or hidden `/home` cannot become a healthy parent-filesystem
   sample. Unknown coverage and collector bounds remain visible; the P2.B unit
   change and actual mount-view proof are required before coverage claims.
8. Late run sequence 4 cannot displace accepted failed sequence 5; duplicate 5
   cannot refresh receipt time. Changed thresholds cannot reinterpret either run.

## P2.A local evidence, 2026-09-29

- **A01:** Migration `003_check_definitions` applied to the owner-checked
  `tinywarden_test_p1b` database on the existing PostgreSQL instance. The
  populated-P1 migration test verifies the one-time initialization audit, version
  count and legacy audit projection. The P2 test rejects invalid tuples, an
  invalid pinned revision and a mismatched agent generation. The P1 migration
  failure probe and P2 injected audit failure leave no partial revision.
- **A02–A04:** `tests/p2a.checks.test.ts` proves inherited delivery after a default
  edit, equal-value override provenance, pinned override delivery, no-op and
  exact replay after a later edit, changed request-ID conflict across roots,
  optimistic conflict, concurrent edits/fetches, revoked/replaced credential and
  expired-session waits, clock bounds, origin/auth/body rejection and audit rollback.
- **A05–A07:** The same server test checks digest, exact omission, unsupported
  applicability, bounds and P1 heartbeat compatibility. Go assignment and
  scheduler tests check cache integrity, scope, missing endpoint, equal/reversed
  response rejection, honest empty capabilities and independent retry lanes.
- **A08:** In an isolated HTTPS Next development copy, Chromium 154 at 1365×900
  and 390×844 rendered the global and host forms without horizontal overflow or
  framework overlay. Browser interaction saved a global edit, saved an override,
  preserved the inherit draft after an intervening global edit, required explicit
  conflict review, then saved inheritance. Tab moved from the selected radio to
  a number input. The browser console showed only the intentional conflict 409
  and the pre-existing missing favicon 404. The Browser plugin and Playwright
  were unavailable; local ChromeDriver supplied rendered interaction evidence.

The guarded web suite passed 47/47 tests in 10 files; web lint/typecheck and
`go test ./...` passed. The isolated preview stopped after QA. No production
build, live database migration, live service change, publication or VM action
was performed. P2.B owns the collector, observation upload and health evidence.

## P2.B local evidence, 2026-09-29

- **B01:** Go mountinfo tests cover local ext4, tmpfs, read-only and shared-capacity
  bind records, escaped paths, kernel/remote exclusions, unknown FUSE, invalid
  UTF-8, inventory/record overflow, disappeared mount, inaccessible inventory
  and changed topology. On the approved Debian13 amd64 VM, a temporary 4 MiB
  tmpfs outside `/` appeared in the fixed collector output from a transient
  unprivileged unit with the proposed host-view directives: mount ID 57,
  total/free/available 4194304 bytes, complete coverage, 13 records and 16
  excluded kernel mounts. The mount, temporary binary and unit were removed;
  the enrolled agent remained active. The persistent installed P1 unit was not
  changed; its eventual P2 unit activation is a P2.C upgrade check.
- **B02:** `tests/p2b.runs.test.ts` checks exact 85/95 boundaries, reserved blocks,
  a percentage that rounds to 85 but classifies healthy, uint64 arithmetic,
  invalid counters and read-only informational mounts. Historical classification
  remains tied to its snapshot after both a global default edit and a host
  override.
- **B03:** Guarded migration004 and ingest tests check exact first-receipt replay,
  changed ID/sequence conflict, concurrent retries, wrong-scope/missing snapshot,
  old-generation credential rejection, 1 MiB route bound, safe-integer dropped
  count at the maximum, and transaction rollback if a mount insert fails. Run
  ingest has no operator audit action; P2.A separately proves audited edits roll
  back with an audit insert failure.
- **B04:** Frozen-clock tests check no contact/no run, incomplete newest sequence
  defeating an older healthy upload, contact loss, strict grace equality,
  agent and server clock uncertainty, and obsolete assignment after a definition
  edit. A delayed upload against the old snapshot enters history with its original
  classification while current health keeps waiting for the updated assignment.
  Current contact and disk health are separate projections.
- **B05:** Go tests check helper timeout, output cap, one owned helper, cancellation,
  a blocked collection with continuing heartbeat, 24-hour lease bounds, exact
  in-flight bytes after failed receipt/restart, monotonic sequence through queue
  drain, scope isolation, corruption, overflow and protected in-flight head.
  Queue and sequence files are fsynced before directory-fsynced rename.

Rendered host detail QA used an isolated HTTPS Next development copy and a
synthetic guarded-test-database host. Chromium 154 at 1365×900 and 390×844
showed critical current health, immutable threshold/source history, tmpfs,
read-only and shared-capacity mount detail without horizontal overflow or a
framework error overlay. The only console error was the pre-existing missing
favicon 404. The isolated preview was stopped after QA. No production build,
live database migration, persistent VM agent/unit change, live service restart,
publication or commit was performed. P2.C still owns outage/reconnect, central
policy delivery on a real agent and phase-wide release checks.

The guarded web suite passed 56/56 tests in 11 files. Web lint, no-write
TypeScript check, `go test ./...`, `go test -race ./...`, `go vet ./...`, Go
format, service unit syntax, source/map/localization/verification gates and
whitespace checks passed. These are provisional local results for the uncommitted
checkout; phase-wide build, dependency/security checks and publication remain at
P2.C closeout.

## P2.C local evidence, 2026-09-29

- **C02:** `agent/internal/agent/disk_recovery_test.go` proves a retryable 503
  keeps the exact in-flight bytes through an outage and drains on a duplicate
  receipt after reconnect, even with a 25-hour-expired assignment lease. A 400
  or 409 rejection pauses only the disk lane, emits `disk_unavailable`, retains
  the exact durable head and leaves heartbeat running. The combined 8 MiB cap
  preserves the in-flight head, drops older other runs and reports a bounded
  drop count in later evidence. A late omitted or full assignment response
  cannot renew or replace a newer persisted cache. A terminal assignment 409
  persistently invalidates the 24-hour lease while retaining the known ID,
  revision and digest; restart plus a failed fetch cannot resume collection.
  `tests/p2c.recovery.test.ts` proves a delayed first receipt and its duplicate
  remain stale despite fresh agent contact. An authenticated current-generation
  revision regression, equal-revision digest divergence, or missing referenced
  upload snapshot commits one generation-scoped recovery marker before 409;
  current health becomes unknown while immutable history remains. Heartbeat,
  policy edits and a no-cache fetch cannot clear it. Explicit credential
  replacement, new-generation delivery and fresh observation restore health.
  `tests/p2c.latch-boundaries.test.ts` independently checks equal-revision ID
  and digest conflicts, unauthenticated and wrong-host non-latching requests,
  concurrent repeated regression creating one marker, and a valid older
  retained snapshot accepting history without a marker. No conflicting
  candidate is published. P2.B proves out-of-order run sequence and newest
  failed evidence. The conditional Astra checkpoint resolved the rollback
  health gap with migration 005 and these passing regressions.
- **C03 safe local gates:** The guarded web suite passed 65/65 tests in 13 files;
  Go tests and race tests, vet, format, module verification and build passed.
  Web lint and no-write TypeScript, source/map/localization/verification gates,
  service unit syntax and whitespace checks passed. An isolated temporary
  lockfile install added 317 packages without modifying the serving checkout.
  `npm audit` found zero vulnerabilities; `govulncheck` found none. A
  temporary-index Gitleaks scan found no leaks in all 154 working-tree paths
  without changing the shared index. A PostgreSQL 18 custom-format backup of the
  guarded test database restored in one transaction to a disposable database
  with matching migration/audit/definition/run/recovery-marker counts
  (`5|1|1|0|0`), ledger 001–005 and revoked PUBLIC CONNECT; the clone and
  archive were removed. An owner-authorized, online `pg_dump -Fc` of the live P1
  database produced a restricted mode-0600 archive. Its disposable restore
  matched all populated P1 row counts and the 001/002 ledger, with valid core
  references, owner and PUBLIC access checks. Guarded migrations 003–005 on
  that clone preserved P1 counts, seeded one 85/95/300 definition and one
  initialization audit, added no runs or recovery markers, and were idempotent
  on rerun. The clone was dropped and the archive retained; live remained on
  001/002 with no P2 tables and the web service active. The
  [single-checkout live plan](../deploy/p2-live-upgrade.md) records exact archive
  hash, measured timings, the fresh final dump after service stop, live
  migration, build, VM upgrade, C01 proof and repair path.

## P2.C live evidence, 2026-09-29

- **C01:** After a P1 heartbeat resumed through the rebuilt public HTTPS web
  service, the Debian 13 VM agent was upgraded in place with its state, binary,
  unit and config preserved in restricted archives. Host ID, agent ID and
  credential generation stayed the same. A ready 85/95/300 assignment and
  complete healthy ext4/tmpfs/vfat observation arrived immediately. Audited
  global 84/95/300 delivered revision 2; override 83/95/300 delivered revision
  3 pinned to definition 2. Changing global default to 82/95/300 while the
  override was active left the agent's assignment ID, digest, revision 3 and 83
  effective threshold unchanged through its next fetch. Reset to inherit
  delivered revision 4 at 82/95/300. Restarting the same binary preserved that
  identity and source; heartbeat and observations continued. A final audited
  edit restored the original global 85/95/300 and delivered inherited revision
  5. All agent digests matched server snapshots. The first run remains healthy
  under its original immutable 85/95 values. One initialization, three global
  edits and two host policy edits are audited; no recovery marker exists. The
  next scheduled run, sequence 4, was complete/healthy under restored revision
  5, and the authenticated host page returned 200 with server-derived current
  health healthy and four immutable history rows.
- **C03 live upgrade:** The existing PostgreSQL instance and single serving
  checkout were used. A restricted online live archive passed a populated P1
  restore and clone-only migrations 003–005 before the stop. The fresh final
  mode-0600 dump passed hash, TOC and P1 owner/count/001–002 ledger checks.
  Live migrations took 0.318 s, preserved P1 counts, and produced the exact
  001–005 ledger and one 85/95/300 definition seed. Serving `npm ci` took 7.004 s
  and the production Next build took 6.226 s while web was stopped. The web
  stop-to-start interval was 2 min 35 s including manual guards and backup
  verification. Public HTTPS, protection, short-lived operator login/Fleet/
  definition reads and logout passed; the P1 agent resumed heartbeat after its
  documented outage backoff. The VM agent stopped for 45 s; same identity,
  running unit and live mount coverage passed. Exact archive and binary hashes
  are in the [upgrade record](../deploy/p2-live-upgrade.md). No second web
  deployment, database restore, credential reset, commit or publication occurred.

The post-upgrade guarded web suite passed 65/65 tests in 13 files. Go race
tests/vet/module verification/build and `govulncheck` passed; web lint,
no-write TypeScript and `npm audit` (zero vulnerabilities), source/map/
localization/unit and whitespace gates passed. Final temporary-index Gitleaks
found no leaks in 154 working-tree paths. Commit, push, GitHub checks and
publication require separate authority. The local C02 proof remains complete.
