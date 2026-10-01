# TinyWarden master plan

## Execution contract

This is the sole roadmap and status record. Statuses: Not started, In progress,
Blocked, Complete. Only one phase is In progress. A batch groups executable tasks
with shared dependencies and a coherent result. Complete its local checks before
starting its dependent batch. Do not equate a task's code change with acceptance.

Run focused local checks per batch. Run the full repository gate, dependency and
secret checks, and any applicable GitHub verification only at phase closeout.
Publish only at a phase boundary after separate publication authority. A failed
required check blocks phase completion; fix it within the same closeout.

Latest completed phase: **P4 complete locally and live**, accepted 2026-10-01 after
the phase gate, bounded R1–R2 repairs and final Astra re-review. P4.1–P4.9 are
satisfied by the recorded lifecycle, notification and release evidence.
The control plane runs P4 with schema 001–009 and approved retention/email jobs;
the unchanged Debian 13 agent retains accepted P3 runtime. Local commits and
publication retain their separate authority.
Continue authorized phases through ready batches; batch boundaries are progress
updates, not stopping points. Stop only for required owner action or phase
completion. P5/P6 retain their separate scope decisions.

## Model switches and confirmation

Owner-approved 2026-09-29 amendment after measuring the P2 delegation experiment:
from P3 onward, one agent works in the main chat. Do not spawn implementation or
review subagents unless the owner explicitly reauthorizes delegation. The earlier
Sol High coordinator / Sol XHigh worker / Astra XHigh specialist procedure was
used for P2 and is retired. P1 and P2 records remain historical evidence.

Use GPT-6.1 Sol High for gathering and routine operational execution, GPT-6.1 Sol XHigh for implementation,
debugging and focused verification, and GPT-6 Astra XHigh for the designated
decisions and reviews. These are main-chat models, not worker roles. At every
required model boundary, record the exact completed step and next action, ask the
owner to switch, and stop dependent work until the owner explicitly confirms the
switch. Do not infer a switch from a generic continuation. After a review, resolve
findings in the appropriate model and return for required re-review.

All current and future Sol checkpoints use GPT-6.1 Sol, preserving the named effort.
GPT-6 Astra XHigh checkpoints remain unchanged. Earlier Sol 6.0 evidence retains
its historical attribution. Model selection remains owner-confirmed.

### Execution procedure

1. Read the requested scope, batch row and checkpoint. Establish the main-chat
   model/effort from reliable runtime information or owner confirmation. A request
   follows the owner's standing phase-continuation instruction: execute ready
   batches in dependency order unless the owner explicitly narrows the scope.
2. Work in the main chat. Keep the checkpoint and private memory current at starts,
   meaningful milestones, model gates, blockers and completion. Do not duplicate
   investigation merely for supervision.
3. At a mandatory or triggered model gate, record the evidence, current model,
   requested model and exact resume action. Mark the unfinished batch Blocked —
   awaiting model confirmation. Stop dependent work, ask the owner to switch the
   main chat, and wait for explicit confirmation before continuing. Confirmation
   carries across batches in this chat until the selected model changes; a new
   chat must re-establish its model and honor any pending request.
4. Run focused checks during batches and required reviews at their named gates.
   Report batch completion in progress updates and continue. End the turn only
   at phase completion or when owner action is required, including a mandatory
   model switch. Complete work only after acceptance and required reviews pass.
5. For an authorized deployment, use the
   [scoped release checklist](../deploy/native.md#select-only-the-changed-release-steps).
   Carry forward matching accepted phase evidence, execute only changed release
   steps and record one concise outcome. A deployment does not reopen unchanged
   phase tests or specialist reviews. Required migration/recovery gates remain.

The P2 measurement recorded 45.9M coordinator tokens versus 89.7M worker tokens:
the coordinator total was about 51% of the worker total. Direct coordination
accounted for 33.1M, including 29.1M from agent waits (24.5M in 164 waits with no
news). Most counted input was cached; there is no single-agent counterfactual or
reliable billable-cost percentage. Avoid agent polling under this workflow.
Model-routing changes do not trigger full verification, GitHub checks or security
scans. Those retain phase-closeout cadence. This workflow grants no new authority
for commits, publication, live operations or product scope.

### Unplanned Astra checkpoints

Stop for a bounded main-chat Astra decision before continuing when the batch
encounters an unresolved trust, data-integrity, concurrency, recovery or
host-execution decision
outside its contract; changes responsibilities across components; or has two focused
debugging attempts with no useful new evidence. Record the reason and required
result, then follow the same model-switch procedure. A clear understood repair stays
with Sol XHigh. Conditional checkpoints may be omitted only when their trigger
is absent, with the reason in batch evidence. Never waive a required review silently.

### Execution checkpoint

This table is the sole current model-switch checkpoint. Preserve prior outcomes in
the evidence ledger and daily memory log before replacing its values.

| Field | Current value |
| --- | --- |
| Active batch and step | Publication verification Blocked awaiting Sol XHigh confirmation. Completed application source is pushed; GitHub's required phase check found a CI platform mismatch. |
| Confirmed model and confirmation | GPT-6.1 Sol High; owner confirmed “switched to sol” and instructed bounded deployment work after the P4 deployment handoff on 2026-10-01. |
| Pending switch and reason | GPT-6.1 Sol XHigh: repair the CI/test platform mismatch while preserving the accepted Debian 13 execution policy. Owner authorized completed-work commits/pushes with “save/commit/push everything”. |
| Completed work and evidence | [Accepted source and phase evidence](../deploy/native-release.md#final-acceptance) carried forward. [Live deployment](../deploy/native-release.md#live-p4-deployment) applied tree ca9f3d9c830454f2d2d4e94adef72b79f85521f9 once in the main checkout, preserved artifacts/config and readable dump, installed changed dependencies, migrated to 001–009, built/restarted and passed authenticated smoke. Web outage 38.80 seconds. Owner approved both jobs; cleanup succeeded, both timers are enabled/active, SMTP TLS/auth passed and the first real alert was relay-accepted. |
| Remaining authorized work / exact resume action | After explicit Sol XHigh confirmation, fix the Ubuntu CI versus Debian 13 agent/test mismatch. [Failed exact-source run](https://github.com/TinyWarden/tinywarden/actions/runs/36842622804) checked b1d65f5b5e9cab36c0aff07ab528ba5e08f6366e: runner tests return policy_rejected and the replacement test cannot collect supported metadata. Keep production admission intact; verify the affected tests and rerun GitHub on the repair commit. No live deployment or new phase is needed. Completed-work commits/pushes remain authorized; P5/P6 retain their scope decisions. |
| Last updated | 2026-10-01 — application published; required GitHub check failed on unsupported Ubuntu test execution. |

## Phase overview

| Phase | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| P0 | Buildable, documented, verifiable non-product scaffold | Approved proposal | Complete |
| P1 | One securely enrolled host, persisted heartbeat and honest stale state | P0 accepted | Complete |
| P2 | Versioned assignments and disk observations end to end | P1 | Complete — accepted locally/live and source published |
| P3 | Tested OS/package, reboot and fstrim recipes | P2; distribution selected | Complete — accepted locally/live and source published |
| P4 | Usable self-hosted release with recovery and retention | P3 | Complete locally and live — P4.A–P4.C accepted and source published |
| P5 | Optional Proxmox context | P4; separate scope decision | Not started |
| P6 | Audited maintenance capability | P4; separate scope/security decision | Not started |

## Batch model sequence

For P3 onward, arrows mean mandatory main-chat model switches with explicit owner
confirmation: Sol High gathers, Sol XHigh implements/verifies and Astra XHigh
performs the named specialist decision/review. The Sol following an Astra design
gate means Sol XHigh for implementation. Stop and record the checkpoint before
each arrow; resume only after confirmation. P1 rows describe historical manual
switches, while P2 rows describe the retired worker experiment. Evidence gathering
must not decide a contract reserved for Astra. Completed work has no retroactive
review requirement.

| Batch | Model sequence | Work and exact switch point |
| --- | --- | --- |
| P1.A | Sol → Astra | Sol collects missing owner/environment facts and researches P1.3 tooling options. Stop before P1.1–P1.2 trust/protocol decisions. Astra establishes those contracts and finalizes the P1.3 choice using that evidence. |
| P1.B | Sol → Astra → Sol | Sol began P1.4–P1.6. The owner-directed single-user PostgreSQL decision triggered Astra, now complete with the revised ownership/configuration/acceptance contracts. Stop for confirmed Sol before adapting source and finishing implementation and local authorization/concurrency tests. |
| P1.C | Sol | Implement and verify P1.7–P1.9 heartbeat client, persistence and status UI. |
| P1.D | Sol → Astra → Sol → Astra → Sol → Astra → Sol → Astra → Sol | All final-review findings were accepted. Owner-confirmed Sol closed the local phase record and committed verified source and private evidence. No further routine Astra review; accepted areas reopen only if changed. |
| P1 first live activation | Sol → Astra → Sol | Sol prepared the build, database and backup evidence. During confirmed Astra, the owner rejected additional ingress and chose 0.0.0.0:10007. During confirmed Sol, the VM enrolled and a linger-backed user service started directly from the main checkout per the owner's correction. No extra proxy or second web deployment remains. |
| P2.A | Sol → Astra → Sol | Sol gathers definition/default/history requirements. Stop before P2.1 decisions; Astra defines ownership, revisions, inheritance and historical interpretation. P2.1 is complete; confirm the initial Sol High coordinator switch, then dispatch Sol XHigh for P2.2–P2.3. No repeated Astra design required. |
| P2.B | Sol | Implement and verify P2.4–P2.6 collection, ingestion and health/history UI. |
| P2.C | Sol; conditional Astra | Sol completes P2.7–P2.8 and gathers P2.9 closeout evidence. Stop for Astra if duplicate delivery, ordering, buffering or stale-state invariants remain unresolved; otherwise record why escalation was unnecessary and close with Sol. |
| P3.A | Sol → Astra → Sol | Requirement gathering and P3.1 design are complete. Sol 6.1 XHigh completed P3.2–P3.3 and A01–A05. No routine repeat of the accepted design; contract changes still trigger the stated Astra rule. |
| P3.B | Sol | Implement and verify P3.4–P3.6 OS recipes and fixtures under P3.A's contract. |
| P3.C | Sol → Astra → Sol → Astra | Complete locally. Final re-review accepted R1–R3 and affected consumers after the repaired source passed its phase gate. Preserve accepted unchanged evidence; no further routine review. Live activation is a separate authorized Sol XHigh action. |
| P4.A | Sol → Astra → Sol | Discovery and P4.1 decision complete. [Data lifecycle](../architecture/data-lifecycle.md) resolves retention, cleanup and P4.3/P4.8 recovery criteria. Stop for explicit Sol XHigh confirmation before P4.2/P4.3 implementation. No repeat Astra design unless an unresolved contract boundary appears. |
| P4.B | Sol → Astra → Sol | Sol resolved email inputs; the triggered Astra system-read/outbox decision is complete in [N01](../architecture/notifications.md). Owner confirmed Sol XHigh; P4.5/P4.6 implementation/capture/loopback proof is complete locally. No additional routine Astra gate before P4.C. |
| P4.C | Sol → Astra | Sol completes P4.7–P4.8 under the agreed recovery contract, release docs and P4.9 phase-end checks. Stop before final review; Astra assesses restore/migration evidence and release/rollback readiness. Deployment still needs separate authority. |
| P5.A | Sol | Complete P5.1–P5.2 read-only provider contracts and adapter; use an unplanned Astra checkpoint if host identity or permissions become ambiguous. |
| P5.B | Sol | Complete P5.3–P5.5 linking, UI, failure tests and closeout; no routine Astra review required. |
| P6.A | Sol → Astra | Sol gathers the separately adopted maintenance scope and operational requirements. Stop before P6.1–P6.3 decisions; Astra defines authorization, expiry/revocation, replay protection and interrupted-action recovery. |
| P6.B | Sol | Implement P6.4–P6.6 against P6.A, including audit/result UI and failure tests; unresolved contract changes trigger an Astra checkpoint. |
| P6.C | Sol → Astra | Sol completes P6.7–P6.8 and gathers P6.9 phase-end evidence. Stop before final review; Astra reviews the action authorization/execution path, duplicates, revocation and recovery before phase completion. |

## P0 — Scaffold

| Batch | Tasks | Prerequisite | Acceptance and local evidence | Status |
| --- | --- | --- | --- | --- |
| P0.A — Contracts | P0.1 Configure repository identity and license; P0.2 establish canonical documents and phased task plan | Approved identities and scope | Paths/remotes/visibility verified; documents have one owner and linked decisions | Complete |
| P0.B — Runnable shell | P0.3 Build informational web shell with English catalogs; P0.4 add Go version/help placeholder; P0.5 document native-service configuration | P0.A | Web builds and starts on loopback; no fake host data; CLI refuses unsupported work; no persistent service starts | Complete |
| P0.C — Verification and review | P0.6 Automate inventory, size, literal-copy and prohibited-file checks; P0.7 verify toolchain and phase-closeout workflow; P0.8 record results and obtain scaffold acceptance | P0.B | Full applicable local gate passed; desktop/narrow and keyboard smoke passed; private lifecycle valid; owner accepted on 2026-09-28 | Complete |

Phase completion: accepted scaffold, linked evidence, no product behavior or
unresolved scaffold blocker. Publication and deployment are separate decisions.

## P1 — First connected host

P1.A selected Debian 13, one local administrator, public HTTPS and a dedicated
PostgreSQL database/schema. The P1.B owner-directed amendment uses the single
`tinywarden` login for migration, application and test access on the existing instance.
The canonical
[access](../security/access.md), [protocol](../architecture/agent-protocol.md),
[data](../architecture/data.md) and [configuration](../deploy/configuration.md)
contracts govern implementation. Actual hostname, native resources and reserved
test targets must be identified before their dependent operations. Authentication
and privacy belong to this phase before network exposure.

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P1.A — Access and contracts | P1.1 Define operator/agent trust and lifecycle; P1.2 specify enrollment/heartbeat schemas, status states and idempotency; P1.3 select typed SQL and migration tools | P0 accepted; decisions resolved | Versioned request/response and data contracts include unauthorized, expired, duplicate, revoked and stale cases; source-backed tool choices | Complete |
| P1.B — Protected enrollment | P1.4 Implement operator access boundary; P1.5 migrate host/agent/token/audit records; P1.6 implement one-time enrollment with hashed credentials | P1.A | Unauthorized operator calls fail; token consumed once under concurrency; repeat requests have explicit outcomes; audit and state commit atomically | Complete |
| P1.C — Heartbeat slice | P1.7 Implement bounded Go HTTPS client and configuration; P1.8 authenticate/store idempotent heartbeats; P1.9 render persisted current/unknown/stale host state | P1.B | One fresh test VM enrolls; a restart retains it; a frozen-clock test proves stale boundaries; credential cross-host access fails | Complete |
| P1.D — Recovery and closeout | P1.10 Implement and test revoke/replace and outage recovery; P1.11 document native install/TLS and recoverable release; P1.12 complete phase gate and review | P1.C | No credential in output; bounded retry state; fresh install/restart/missed-heartbeat journey verified; complete checks at closeout | Complete |

## P2 — Definitions and disk results

P2.1's selected [definitions](../architecture/check-definitions.md),
[observations](../architecture/disk-observations.md) and
[acceptance matrix](p2-acceptance.md) govern the following batches. Design completion
does not claim runtime acceptance or authorize live migrations.

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P2.A — Versioned definitions | P2.1 Define definition/assignment ownership; P2.2 implement revision fetch and applicability; P2.3 add authorized/audited assignment changes | P1; threshold provenance settled | Unauthorized edits fail; unchanged revisions omit payload safely; historic runs retain interpretation | Complete — A01–A08 passed locally |
| P2.B — Disk observation slice | P2.4 Add built-in filesystem collector; P2.5 ingest unique run IDs with bounded measurements; P2.6 derive disk health and show detail/history | P2.A | Duplicate results do not duplicate history; stale/unknown never become healthy; threshold edges use deterministic tests | Complete — B01–B05 passed locally |
| P2.C — Definition delivery and closeout | P2.7 Verify central threshold update reaches an agent without binary update; P2.8 test capped buffering and older responses; P2.9 close phase | P2.B | Inherited/snapshot/override cases remain distinct; old responses cannot overwrite new state; focused outage and phase gates pass | Complete — C01–C03 local/live acceptance passed; publication pending |

## P3 — OS-specific baseline checks

The selected [execution](../architecture/recipe-execution.md),
[observation/integration](../architecture/baseline-observations.md) and
[acceptance](p3-acceptance.md) contracts govern P3. P3.A builds the isolated
runner; P3.B adds normalizers and recipes; P3.C defines exact wire/SQL shapes
under these invariants, connects delivery/results/UI and closes the phase.

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P3.A — Execution boundary | P3.1 Define executable/argument allowlist and privilege policy; P3.2 implement unprivileged exec without shell; P3.3 enforce time/output/working-directory limits | P2; distribution contract | Rejected binaries/arguments cannot execute; timeout kills only owned children; truncated output has explicit state | Complete — P3.1–P3.3 and A01–A05 accepted locally |
| P3.B — Recipes | P3.4 Implement update observation recipe; P3.5 implement reboot-required recipe; P3.6 define and implement fstrim evidence semantics | P3.A | Each tested OS has clear applicability, success/failure/unknown mapping and fixtures; unsupported OS stays unknown | Complete |
| P3.C — Fleet workflow and closeout | P3.7 Add baseline assignment and attention views; P3.8 exercise central recipe revision without agent rebuild; P3.9 publish tested support matrix and close phase | P3.B | Real test-host observations explain attention; keyboard/narrow layouts and catalog-only text pass; phase gate complete | Complete — C01–C04, phase gate and final review accepted locally |

## P4 — Self-hosted release quality

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P4.A — Data lifecycle | P4.1 Set retention/archive/delete rules; P4.2 implement bounded cleanup with audit; P4.3 verify backup and restore | P3; retention owner decision | Deletion respects references; restores reconcile counts and credentials; no unexplained data loss | Complete locally and live — P4.1–P4.3 accepted; approved cleanup active |
| P4.B — Notifications | P4.4 Select alert channels and consent/delivery policy; P4.5 implement idempotent dispatch and limits; P4.6 test failures in capture transport | P4.A; explicit external-communication adoption | Tests send nothing to real recipients; uncertain delivery is observable and not blindly retried | Complete locally and live — P4.4–P4.6/N01 accepted; approved SMTP jobs active |
| P4.C — Release rehearsal | P4.7 Package native control plane and agent with a reusable deployment entry point; P4.8 rehearse install/upgrade/recovery on approved disposable resources; P4.9 complete release docs and phase gate | P4.B | New operator can deploy, enroll several hosts and recover from backup; exact release and rollback verified | Complete locally — P4.7–P4.9, phase gate and final Astra re-review accepted |

## P5 — Optional Proxmox enrichment

This is gated future scope. Core host operation remains provider-neutral.

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P5.A — Provider boundary | P5.1 Define read permissions and metadata contract; P5.2 implement narrow Proxmox adapter with fake provider tests | P4; integration adopted | Credentials remain server-side; provider failure does not disable host health | Not started |
| P5.B — Linking and closeout | P5.3 Add explicit host/provider links and UI; P5.4 test unlink/stale metadata behavior; P5.5 close phase | P5.A | Metadata grants no command authority; non-Proxmox hosts retain full core functionality | Not started |

## P6 — Optional maintenance

This is gated future scope. Check execution alone never authorizes maintenance.

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P6.A — Authorization contract | P6.1 Define action scope, expiry, approval and privilege model; P6.2 specify signed/authorized delivery and idempotency; P6.3 review failure/recovery cases | P4; explicit adoption | Each actor/action/resource has an authoritative permission and recovery path | Not started |
| P6.B — One action slice | P6.4 Implement one approved action end to end; P6.5 add audit/result UI; P6.6 test expiry, revocation, duplicates and uncertainty | P6.A | No expired/revoked/cross-host action executes; audit explains authorized outcomes | Not started |
| P6.C — Rehearsal and closeout | P6.7 Rehearse interrupted execution on disposable hosts; P6.8 document operational recovery; P6.9 complete phase gate | P6.B | Retry policy cannot duplicate unsafe effects; no production action occurs during tests | Not started |

## Evidence ledger

Record task/batch result, exact command or review procedure, date, revision or
tracked snapshot, and durable evidence link here when closing a phase. Sensitive
evidence is stored privately and referenced without exposing content.

P0, 2026-09-28: tasks P0.1–P0.7 verified. See the
[actual scaffold results](verification.md#p0-scaffold-evidence).
P0.8 was accepted on 2026-09-28; P0 is Complete. Initial local commits were also
authorized. The exact review tree, application commit and acceptance evidence are
recorded in the private development memory. Product phases were Not started at that
checkpoint; the current status is in the phase table above.

P1.A, 2026-09-28: P1.1–P1.3 contract batch complete. The [P1 acceptance record](p1-acceptance.md)
contains seven reviewed failure/concurrency traces and AC01–AC19 for the implementation
batches. New canonical access, agent protocol, data, configuration and acceptance
documents are indexed; map/roles and related contracts reconciled. Official npm
metadata confirms selected Kysely/pg versions, runtime requirements and MIT licenses.
Focused checks: `node scripts/codebase-map.mjs` (62 paths),
`node scripts/check-source.mjs`, local document-link/anchor resolution and
`git diff --check` passed; private lifecycle validation passed. Exact reviewed content
identities and Foundation manifest are in private evidence. Work remains uncommitted;
persist the reviewed documentation with its evidence at the next authorized checkpoint.
This is design acceptance; runtime proofs, dependency installation and all production
operations remain with their owning implementation/deployment batches. No phase-end
GitHub/security check was run for this batch.

P1.B design amendment, 2026-09-28: owner-confirmed Astra resolved the single-user
PostgreSQL requirement. The [ownership contract](../architecture/data.md#postgresql-ownership-and-test-targets)
and [AC05 amendment](p1-acceptance.md#p1b-single-user-contract-amendment) explicitly
replace the prior role separation and DDL/audit-denial claim. Official PostgreSQL 18
ownership/role semantics and read-only instance attributes were reconciled; current
permissions suffice. Source changes and executed runtime acceptance remain with Sol.
Focused amendment checks passed: local links/anchors (52 in 14 documents), the
existing tracked-path map (62 paths), whitespace in both repositories and private
lifecycle validation. This verifies the documentation step; draft source integration
and the full P1.B source/map inventory remain pending. No phase-end scan ran.

P1.B implementation, 2026-09-28: P1.4–P1.6 and AC01–AC09 passed locally against
the existing PostgreSQL 18.6 instance's guarded `tinywarden_test_p1b` database.
The [runtime acceptance record](p1-acceptance.md#p1b-runtime-acceptance) maps the
19 focused database/CLI tests to the cases. Optimized Next build compiled all six
API routes; a stopped loopback server confirmed anonymous and cross-origin denial.
Web lint/typecheck, source size, codebase map (89 tracked paths), catalog-only JSX
and verification regressions passed. A synthetic scrypt sample took 230 ms and the
Node/tsx process reached 216440 KiB peak RSS on this host; this is a local capacity
sample, not a production service measurement. The full web suite and final docs,
whitespace and private lifecycle checks are recorded in private P1.B evidence.
No live database/service, phase-end security/dependency scan or GitHub check ran.

P1.C implementation and acceptance, 2026-09-28: P1.7–P1.9 and AC10–AC14 passed
on isolated test resources. The [acceptance record](p1-acceptance.md#p1c-acceptance)
maps 27 web tests, Go tests/vet, optimized build and desktop/mobile review to the
required boundaries. A disposable Debian 13.4 x86_64 VM enrolled over validated
test HTTPS, sent sequence 1, retained identity across control-plane/agent restarts
for sequence 2, and recovered pending sequence 3 after an induced test-server
outage. The guarded fleet API showed current contact with health unknown. The VM
test used loopback servers and the existing owned `tinywarden_test_p1b` database;
the public hostname/port deployment route remains P1.D. Source and evidence remain
uncommitted; no live database/service, phase-end scan or GitHub check ran.

P1.D audit decision, 2026-09-28: owner-confirmed Astra resolved the audit actor/target
conflict. The [data contract](../architecture/data.md#audit-actor-and-target-representation)
requires separate explicit target identity and immutable migration 002; existing
actor fields/checks and audit history are preserved. All nine audit actions were
traced through their writers, and [amendment proofs](p1-acceptance.md#p1d-audit-amendment-proof-requirements)
cover populated upgrade, compatibility, provenance and atomic rollback. This is
design acceptance only; source repairs and tests await confirmed Sol XHigh. The
last lifecycle run remains 2/5 passing. Final phase review remains required.

P1.D Sol implementation, 2026-09-28: the
[local acceptance record](p1-acceptance.md#p1d-local-acceptance-and-closeout-evidence)
now supersedes the earlier failing draft result. The additive audit migration,
revocation/rotation paths, agent recovery tests, native service templates and
release/restore runbook are implemented locally. The full local phase-end gate
passed after one lint repair, with 35 web tests, Go tests/vet/build, npm and Go
dependency checks, production build, unit syntax and staged secret scan. Synthetic
backup/restore and loopback restart also passed; no live resource was changed.
The public hostname returns 502 because port 10007 is unbound. P1.D awaits the
planned Astra review; GitHub checks require a separately authorized published
commit and live activation requires deployment authority.

P1.D final review, 2026-09-28: the required review found five repair areas and
additional acceptance cases. The [review disposition](p1-acceptance.md#p1d-review-disposition)
supersedes any implication of final acceptance from the earlier automated pass.
Corrections to earlier P1 consumers remain owned by this active closeout batch;
the original P1.B/P1.C results remain historical. After confirmed Sol repairs and
verification, confirmed Astra re-review is required before P1.D can complete.

P1.D Sol repairs, 2026-09-28: R1–R5 were implemented and verified on the existing
test database, local TLS fixtures and rendered Chromium at desktop/narrow widths.
The final local phase gate passed: 39 web tests in nine files, Go checks, optimized
web build, 115-path map, both native units, npm audit, govulncheck and staged
secret scan. The [acceptance record](p1-acceptance.md#p1d-review-disposition)
tracks the repaired behavior; private evidence records the exact staged tree and
browser captures. P1.D remains blocked for owner-confirmed Astra re-review.

P1.D Astra re-review, 2026-09-28: accepted retry-delay, pending-version, session-time
and fleet-lifecycle repairs. Independent tests with a simulated newer binary and
consecutive degraded responses passed. One terminal-response classification case
still fails AC17 and returns to Sol through the confirmation checkpoint. The
[review disposition](p1-acceptance.md#p1d-review-disposition) records the narrowed
remaining scope; private evidence contains exact reproductions. No runtime source,
live operation, commit, GitHub check or full security scan changed in this review.

P1.D Sol R1a follow-up, 2026-09-28: owner-confirmed Sol XHigh moved terminal
status and invalid success-header decisions ahead of the fallible response-body
read. Local TLS regressions cover every reported truncated rejection and invalid
header, unexpected success statuses, and preserved retry of interrupted valid
200/201 and 429/503 responses. The final local phase gate passed on the existing
test database, including 39 web tests, Go checks, build, 116-path map, native unit
syntax, dependency audits and staged secret scan. Only evidence/checkpoint documents
changed afterward. Stop for the required owner-confirmed Astra XHigh re-review of
R1a and its affected consumers; do not mark P1.D complete before that result.

P1.D final transport review, 2026-09-28: owner-confirmed Astra accepted R1a and
its enrollment/replacement/heartbeat, retry-loop, CLI and service consumers.
Independent local TLS tests passed all 37 stalled terminal-response cases: one
request, no degraded retry, and byte-identical saved state. The gated runtime
source is unchanged; prior R2–R5 acceptance remains valid. No review finding
remains. The source and evidence still need authorized local commits to make
the phase checkpoint durable; GitHub/publication and live activation remain
separate, unexecuted operations. The execution checkpoint owns the next Sol step.

P1 local phase closeout, 2026-09-28: the owner confirmed Sol XHigh and authorized
separate local application and private-memory commits. P1.A–D satisfy their local
acceptance criteria. The final source is the reviewed, gated snapshot; only
completion documentation changed afterward. The exact application commit is the
revision containing this record and is indexed in private memory. GitHub checks
await separately authorized publication of that revision. The first live service,
database migration, public hostname and agent installation remain release tasks
under the [native guide](../deploy/native.md), not evidence claimed by this phase.

P2.1 design, 2026-09-29: owner-confirmed Astra completed the definition/assignment
contract, all-local filesystem and historical-result semantics, editing states and
[P2 proof matrix](p2-acceptance.md). Eight design traces cover source provenance,
concurrent edits, replay, generation authority, cache identity, applicability,
coverage and historical ordering. Focused checks passed: 119-path map, 192 local
document links/anchors across 48 Markdown files, whitespace in both repositories
and private lifecycle validation. Exact document hashes and the reconciled
Foundation manifest are in private evidence. This is P2.1 design acceptance only;
P2.A awaits confirmed Sol for P2.2–P2.3 and A01–A08. No runtime tests, builds,
migrations, service changes, phase-end scans, GitHub checks or commits ran.

Historical P2 workflow amendment, 2026-09-29 (superseded above for P3 onward):
the owner adopted Sol High as coordinator, Sol
XHigh implementation workers and Astra XHigh specialists for designated decisions/
reviews. Recorded delegation/result gates replace routine manual model switching.
Substantive reports occur at phase completion or when human intervention is needed;
brief required progress updates remain. The initial coordinator switch is pending.
No worker/product work started during the workflow discussion. Existing acceptance,
authorized task scope and phase-end check cadence remain unchanged.

P3.1 design, 2026-09-29: selected the compiled observation command policy,
unprivileged fixed environment, bounded supervisor/group lifecycle, typed evidence
and compatible baseline delivery/history requirements. Eight contract traces in
[P3 acceptance](p3-acceptance.md#p31-design-review) cover rejected authority,
central revision, descendants, output races, stuck cleanup and misleading health
signals. Official Go/Linux/Debian sources and a read-only Debian service-property
probe informed the design. This closes the design task only; P3.A implementation
and A01–A05 remain for confirmed Sol XHigh. No runtime test, migration, service
change, dependency install, phase-end scan, GitHub check or commit occurred.
Focused documentation checks passed: 157-path inventory, 255 local document
links, whitespace in both repositories and private lifecycle validation.

P3.A implementation, 2026-09-29: the bounded runner and fixed internal CLI dispatch
pass [A01–A05](p3-acceptance.md#p3a-implementation-evidence), including real native
execution, a disposable actual CLI build, direct exit/signal preservation, whole
deadline/cancellation, independent caller progress, strict framing, descendant
and parent-death cleanup, unrelated-process survival, kill-before-reap ordering,
held-slot fault injection, exact output limits, raw JSON exclusion and race
ownership. Focused Go tests/vet/format, 173-path map/source, links, whitespace and
lifecycle pass. No new dependency, baseline advertisement, scheduling, database,
installed service or live activation. Phase-end scans and final Astra review remain
P3.C. Next batch is P3.B on the same confirmed Sol 6.1 XHigh model.

P3.B implementation, 2026-09-29: fixed recipes and agent-side normalizers for
cached APT plans, optional reboot marker and fstrim systemd evidence pass
[B01–B04](p3-acceptance.md#p3b-implementation-evidence). Server-owned strict
validation and evaluation share 42 authored v1 fixtures with Go; English catalogs
own all reasons and scope limits. Cached zero and marker absence stay unknown;
fstrim success needs actual completed service and scheduling/condition evidence.
Seven Go test functions, race/vet/format, 50 web tests, ESLint and static typecheck
pass. Source/map covers 231 paths; copy, links, whitespace and lifecycle pass.
No connected baseline scheduler, capability advertisement, persistence, web build,
service/VM upgrade or deployment. No unresolved out-of-contract decision triggered
an early Astra checkpoint. Next batch is P3.C on Sol 6.1 XHigh, with the mandatory
Astra XHigh final review before phase completion. Phase-end security/GitHub checks
retain their original cadence; no commit or publication occurred.

P3.C Sol closeout, 2026-09-30: exact compatible delivery/schema/private state,
async connected baseline worker, immutable result history and scoped UI/settings
pass [C01–C04 local evidence](p3-acceptance.md#p3c-implementation-evidence).
Two configured disposable Debian VM executions prove actual observations, the
same-binary APT mode revision/restoration, restart and disk/heartbeat continuity.
Desktop/narrow settings/conflict/retry and health expiry/failure/permission proof
pass. Full phase entry point passes on an independently copied 284-path tree,
with 139/139 web tests, Go/format/vet/build/modules, lint/types/Next build, units,
dependency and staged-secret gates. Legacy test reset/clock repairs changed no
product behavior. Runtime fingerprint and exact snapshot are retained privately.
The release proposal is prepared; live PostgreSQL stays 001–005, public service
and installed P2 agent remain active. Stop now for confirmed main-chat GPT-6
Astra XHigh final review; P3.9 and the phase are not complete until it passes.
No live upgrade, commit, push or GitHub operation was performed.

P3.C Astra review, 2026-09-30: [R1–R3](p3-acceptance.md#p3c-astra-review)
require preserving global HTTP 401 cancellation through local pause-write failure,
detecting a future persisted validation timestamp before restart renewal, and
preparing the native unit's explicit cleanup settings and installation procedure.
Focused review-only Go reproductions demonstrate R1/R2; R3 is confirmed against
the contract and unit. The verified source remains unchanged. Stop for explicit
GPT-6.1 Sol XHigh confirmation, repair and verify all three, then return for
owner-confirmed Astra XHigh re-review. P3 remains open; live release and publication
authority are unchanged.

P3.C Sol repairs, 2026-09-30: all three findings have implementations and focused
regression proof. Original Astra tests and eight new/affected Go race tests pass.
The prepared native unit has exact cleanup values, with reviewed-unit installation
and readback in the upgrade proposal. One final full phase gate passes on
temporary-index tree bb499726f850d94583d48242fecd1c2a7f45ae21 (286 owned paths,
139 web cases, all Go/static/build/unit/dependency/secret checks). No changes to
serving artifacts, live schema or installed VM. Stop for explicit main-chat
GPT-6 Astra XHigh confirmation for bounded R1–R3 re-review; local phase acceptance
and separate live/publication authority remain pending.

P3 final re-review, 2026-09-30: owner-confirmed Astra accepted R1–R3 and affected
consumers against the repaired 249-path fingerprint and full phase evidence.
No additional blocking finding or code change. A01–A05, B01–B04 and C01–C04 are
accepted; P3.C/P3.9 and local P3 are Complete. Public status/support documentation
is reconciled. The proposed next action is the separately authorized P3 live
upgrade on confirmed Sol XHigh. No routine additional Astra review is required
for unchanged accepted source; commit/publication and P4 remain separate actions.

P3 live deployment, 2026-09-30: owner authorized “deploy p3” on the Sol XHigh
deployment checkpoint. The approved single-checkout procedure passed populated
existing-instance restore/migration/idempotency rehearsal and final live migration
with original P1/P2 rows/history preserved, three audited seeds and 66 reference
checks. Web interruption was 14.83 seconds; installed VM agent interruption was
0.82 seconds, preserving identity/configuration and sequence. Effective native
unit values match the reviewed contract. Public login/Fleet, fresh complete healthy
disk/contact, all three typed baselines and central mode revision/restoration pass.
Original settings are desired and delivered at revision 5; historical recipes remain
distinct. Desktop/narrow UI and keyboard history pass. The existing missing browser
tab icon is cosmetic and recorded; no application runtime error. Recovery archives
remain restricted outside the repositories. No runtime source changed, so prior
phase/security evidence remains valid. P3 is Complete locally and live;
commit/publication and P4 remain separate actions.

P4.1 decision, 2026-09-30: [data lifecycle](../architecture/data-lifecycle.md)
defines 90-day observation expiration without separate exports; compact receipts
preserve retry identity and ordering. Audit/configuration/identity history remains.
The local cleanup root is bounded and audited; first purge makes pre-retention code
ineligible for rollback. P4.3 owns one synthetic populated recovery rehearsal on
the existing PostgreSQL instance, reusable for matching deployment. Implementation
and acceptance remain pending; confirm Sol XHigh before P4.2/P4.3.

P4.A implementation, 2026-09-30: [owning procedure](../architecture/data-lifecycle.md#local-implementation-and-operation)
and focused acceptance cover migration 008, compact removed-run receipts, unchanged
wire/digests, expired-history reads, bounded transactional cleanup/audit and guarded
CLI. Fourteen new lifecycle/recovery tests, 46 affected regressions and two catalog
tests pass. One synthetic populated dump/restore reconciles data/ACLs and proves
credentials, receipt retries and recovery latches on the existing instance; the
owned restore target is removed. Static/source/map/localization and whitespace
checks pass. No serving build, live mutation/activation or phase-wide scans. P4.B
and P4.C remain unfinished; phase review and live operations retain their gates.

P4.B discovery checkpoint, 2026-09-30: owner selected email with warning/critical
checks, offline transitions and recoveries, once per state change. Delivery settings
are held in ignored private configuration with capture mode. Existing health roots
are authenticated operator reads; notification sampling introduces a system consumer
and requires a shared evaluation/authority boundary. SMTP acknowledgement loss
requires explicit claim/outcome/recovery semantics. These trigger the unplanned
Astra rule; stop for confirmed Astra XHigh before deciding those contracts. Return
to confirmed Sol XHigh for implementation. No real email or live activation.


P4.B N01 decision, 2026-09-30: owner confirmed Astra XHigh. The
[notification contract](../architecture/notifications.md) resolves shared health
ownership/system authority, sampled transition identity, atomic outbox/audit,
serialized claims, bounded known-failure retries, terminal uncertainty and restored
queue suppression. One recipient, catalog-only bounded messages, capture isolation
and local outcome visibility keep the first slice bounded. Documentation/map/link
and whitespace checks pass; no runtime/dependency/service/provider change. Return
to explicit Sol XHigh for P4.5/P4.6. P4.C retains phase gates and final review.


P4.B implementation/acceptance, 2026-10-01: [owning contract and commands](../architecture/notifications.md#local-commands-and-accepted-implementation)
record shared health captures, separate operator/system roots, additive migration
009 and action-specific audit, durable state/outbox, current-state claim, exact-PG
session cancellation, bounded dispatch/retries, uncertainty/review and restored-epoch
suppression. SMTP/MIME is behind pinned Nodemailer; provider configuration inactive.

Thirty-five new cases pass. One complete affected web pass had 160 passing cases,
25 cases blocked by old fixture truncate inventories, and three ledger/upgrade
fixture failures. Fixed only those fixtures and the source-backed lint/header issues;
the targeted eight-file 48-case pass succeeded. Reusing the matching 140 passing
cases outside that subset accepts all 188 cases without another full rerun. Populated
001/007 upgrades and the 009-aware synthetic dump/restore passed on the existing
PostgreSQL instance. TypeScript, changed-file lint, CLI status/disabled/wrong-target,
source/catalog, 323-path map, local links and both whitespace checks pass. Largest
handwritten file remains 296 lines. Private source manifest identifies 288 non-Markdown
Git paths; tests and owning contract retain reproducible public proof obligations.
No serving dependency replacement/build, real provider contact, live mutation or
activation, agent operation, phase security/GitHub check, commit or publication.
P4.C retains packaging, phase checks and final Astra review; live remains P3.

P4.C/P4 final acceptance, 2026-10-01: owner-confirmed GPT-6 Astra XHigh accepted
the [native release and repaired boundaries](../deploy/native-release.md#final-acceptance).
The complete phase gate, populated database recovery and unchanged P3 agent/UI
evidence remain valid. Sol resolved production build dependency omission and
uncertain-start cleanup with ten portable native cases and one actual isolated
production install/build. Final review reconciled all 296 fingerprints against
accepted tree ca9f3d9c830454f2d2d4e94adef72b79f85521f9 and matching artifacts;
no additional execution gate was needed. P4.1–P4.9 are complete locally with no
remaining blocker. Live P3 is unchanged; deployment/jobs/real SMTP, commits and
publication retain their separate authority. Future authorized routine deployment
uses owner-confirmed Sol High and matching accepted evidence.

P4 live deployment, 2026-10-01: owner confirmed Sol and approved “Enable cleanup
and real email alerts”. The [native release](../deploy/native-release.md#live-p4-deployment)
succeeded with one dump/install/migration/build/restart and authenticated smoke;
web outage 38.80 seconds. Schema 001–009 is live; both timers are enabled/active,
first cleanup completed with no expired rows, and SMTP accepted the first alert.
Matching phase tests/audits/recovery evidence were reused. No agent upgrade,
commit or publication occurred. P4 is complete locally and live.

Publication checkpoint, 2026-10-01: owner authorized saving/committing/pushing all
completed work. Public source b1d65f5b5e9cab36c0aff07ab528ba5e08f6366e includes
P1 history and completed P2–P4 changes. Accepted 296 runtime fingerprints match;
staged publication and existing histories pass secret checks. The private memory
repository remains private. The single [GitHub phase-closeout run](https://github.com/TinyWarden/tinywarden/actions/runs/36842622804)
failed because its Ubuntu runner does not satisfy Debian 13 agent metadata and
execution admission. Local/live acceptance remains retained; publication
verification awaits the named Sol XHigh repair. Documentation closeout changes
only Markdown and carries this exact-source CI result without another dispatch.
