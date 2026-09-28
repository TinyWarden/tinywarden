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

Current phase: **none active**. P1 local implementation and acceptance completed
on 2026-09-28. P2.A is the next planned development batch. Public activation of
P1 is a separate release operation under the native deployment guide. Future
phases define intended scope, not permission to start later integrations or
privileged operations.

## Model switches and confirmation

Owner-approved on 2026-09-28. In this plan, **Sol** means **GPT-6 Sol XHigh** and
**Astra** means **GPT-6 Astra XHigh**. Sol is the default for implementation,
evidence gathering, tests and documentation. Astra handles the bounded decisions
and critical reviews identified in the batch model table below.

A request to finish a batch authorizes its work through the next model checkpoint.
**It never authorizes continuing past a pending switch without the owner's explicit
confirmation that the requested model and reasoning level are selected.** Apply this
in both directions, including returning from Astra to Sol to preserve allowance.

### Execution procedure

1. Before starting or resuming a batch, read its task row, model sequence and the
   execution checkpoint below. Establish the active model from reliable current
   runtime information or the owner's confirmation. If it is unknown or differs
   from the required model, request the required selection and wait.
2. Complete the authorized work assigned to the current model. At a switch point,
   save the progress, affected files/revision, verification evidence, remaining tasks
   and exact next action in this plan's checkpoint. Link private diagnostics from
   private context; keep sensitive details out of this public document.
3. Mark the unfinished batch **Blocked — awaiting model confirmation** and ask:
   “Please switch to GPT-6 Astra XHigh [or GPT-6 Sol XHigh] for [specific task],
   then confirm that you have switched. I will resume at [exact next action].”
4. **Stop batch execution and wait.** Do not perform its next tasks, start another
   batch, substitute a different model or delegate around the checkpoint. Answering
   the owner's questions and maintaining the checkpoint are allowed while waiting.
   Time passing, a generic request to continue, or a claimed automatic switch does
   not count as confirmation. Once a switch has been requested, runtime information
   alone also cannot clear the required owner confirmation.
5. On explicit confirmation, record the model, reasoning level and confirmation
   date; clear the pending request and return the batch to **In progress**. Reconcile
   any intervening file changes, then resume at the saved action without repeating
   completed tasks or checks unless the evidence has become stale. If reliable
   runtime information contradicts the confirmation, resolve that before proceeding.
6. Keep the checkpoint current at every switch request, confirmation, meaningful
   batch milestone, blocker and completion. Confirmation carries across batches
   within the same chat until the selected model changes or another switch is
   requested. A later chat must establish its active model again and honor any
   pending request. Private current context links here instead of owning a second
   model-switch status record.

Complete a batch only after its remaining tasks, required reviews and acceptance
checks pass. When an Astra review requires repairs, record the findings and which
need re-review, request a confirmed return to Sol for implementation, and request
Astra again for any required re-review. If the batch ends on Astra, report that the
next Sol batch requires a confirmed switch when that batch is requested; do not
start it automatically.

Model switches do not trigger full verification, GitHub checks or security scans.
Those retain their phase-closeout cadence. Early Astra checkpoints establish design
contracts; formal security reviews occur at phase closeout. Model confirmation grants
no additional permission for scope changes, commits, publication or live operations.

### Unplanned Astra checkpoints

Stop and request Astra before proceeding when a batch encounters an unresolved
trust, data-integrity, concurrency, recovery or host-execution decision outside its
agreed contract; a change that alters responsibilities across components; or two
focused debugging attempts that produce no useful new evidence. Record the specific
reason and bounded Astra task in the checkpoint. A clear failure with an understood
repair stays with Sol. After resolving the decision, return to Sol through the same
confirmation procedure for the remaining implementation.

Update the affected batch's model row when new work or evidence changes its routing.
Do not silently waive a required Astra checkpoint. Conditional checkpoints may be
omitted only when their stated trigger is absent, with the reason in batch evidence.

### Execution checkpoint

This table is the sole current model-switch checkpoint. Preserve prior outcomes in
the evidence ledger and daily memory log before replacing its values.

| Field | Current value |
| --- | --- |
| Active batch and step | P1.D Complete; no development batch active. |
| Confirmed model and confirmation | GPT-6 Sol XHigh; owner explicitly confirmed “Switched; commit P1 locally in both repositories” on 2026-09-28. |
| Pending switch and reason | None. |
| Completed work and evidence | P1.A–D are locally complete. The phase gate passed 39 web tests, Go checks, build and phase scans. Astra accepted the final transport repair and 37 independent stalled-response cases. The [acceptance record](p1-acceptance.md) holds public evidence; the exact source commit and private review evidence are recorded in the separate memory repository. |
| Remaining authorized work / exact resume action | No P1 implementation work remains. Begin P2.A requirement gathering only when requested, using confirmed Sol XHigh; stop for confirmed Astra before P2.1 contract decisions. Publication, GitHub execution and live activation require their own authority and exact-release checks in the [native deployment guide](../deploy/native.md). |
| Last updated | 2026-09-28 — owner-confirmed Sol and local P1 commit authority; local phase closeout complete. |

## Phase overview

| Phase | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| P0 | Buildable, documented, verifiable non-product scaffold | Approved proposal | Complete |
| P1 | One securely enrolled host, persisted heartbeat and honest stale state | P0 accepted | Complete |
| P2 | Versioned assignments and disk observations end to end | P1 | Not started |
| P3 | Tested OS/package, reboot and fstrim recipes | P2; distribution selected | Not started |
| P4 | Usable self-hosted release with recovery and retention | P3 | Not started |
| P5 | Optional Proxmox context | P4; separate scope decision | Not started |
| P6 | Audited maintenance capability | P4; separate scope/security decision | Not started |

## Batch model sequence

Arrows are mandatory stop-and-confirm boundaries whenever the required model changes.
Evidence gathering must not decide the contract reserved for Astra. Sol implements
against the resolved contract; it does not independently redesign it. P0 is already
complete and has no retroactive model requirements.

| Batch | Model sequence | Work and exact switch point |
| --- | --- | --- |
| P1.A | Sol → Astra | Sol collects missing owner/environment facts and researches P1.3 tooling options. Stop before P1.1–P1.2 trust/protocol decisions. Astra establishes those contracts and finalizes the P1.3 choice using that evidence. |
| P1.B | Sol → Astra → Sol | Sol began P1.4–P1.6. The owner-directed single-user PostgreSQL decision triggered Astra, now complete with the revised ownership/configuration/acceptance contracts. Stop for confirmed Sol before adapting source and finishing implementation and local authorization/concurrency tests. |
| P1.C | Sol | Implement and verify P1.7–P1.9 heartbeat client, persistence and status UI. |
| P1.D | Sol → Astra → Sol → Astra → Sol → Astra → Sol → Astra → Sol | All final-review findings were accepted. Owner-confirmed Sol closed the local phase record and committed verified source and private evidence. No further routine Astra review; accepted areas reopen only if changed. |
| P2.A | Sol → Astra → Sol | Sol gathers definition/default/history requirements. Stop before P2.1 decisions; Astra defines ownership, revisions, inheritance and historical interpretation. Stop for Sol confirmation before implementing P2.2–P2.3. |
| P2.B | Sol | Implement and verify P2.4–P2.6 collection, ingestion and health/history UI. |
| P2.C | Sol; conditional Astra | Sol completes P2.7–P2.8 and gathers P2.9 closeout evidence. Stop for Astra if duplicate delivery, ordering, buffering or stale-state invariants remain unresolved; otherwise record why escalation was unnecessary and close with Sol. |
| P3.A | Sol → Astra → Sol | Sol gathers supported-OS and executable requirements. Stop before P3.1 permissions/execution-policy decisions. Astra defines the boundary; stop for Sol confirmation before P3.2–P3.3 runner implementation and limit tests. |
| P3.B | Sol | Implement and verify P3.4–P3.6 OS recipes and fixtures under P3.A's contract. |
| P3.C | Sol → Astra | Sol completes P3.7–P3.8, support documentation and P3.9 phase-end checks. Stop before final review; Astra reviews executable/argument restrictions, privilege, child-process cleanup and output/time bounds. |
| P4.A | Sol → Astra → Sol | Sol gathers retention and recovery requirements. Stop before P4.1 decisions and the recovery contract used by P4.3/P4.8. Astra resolves deletion, restore and migration/rollback criteria; stop for Sol confirmation before P4.2 cleanup and P4.3 verification. |
| P4.B | Sol | Resolve owner channel choices, then implement and verify P4.4–P4.6 notifications using capture transports. |
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

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P2.A — Versioned definitions | P2.1 Define definition/assignment ownership; P2.2 implement revision fetch and applicability; P2.3 add authorized/audited assignment changes | P1; threshold provenance settled | Unauthorized edits fail; unchanged revisions omit payload safely; historic runs retain interpretation | Not started |
| P2.B — Disk observation slice | P2.4 Add built-in filesystem collector; P2.5 ingest unique run IDs with bounded measurements; P2.6 derive disk health and show detail/history | P2.A | Duplicate results do not duplicate history; stale/unknown never become healthy; threshold edges use deterministic tests | Not started |
| P2.C — Definition delivery and closeout | P2.7 Verify central threshold update reaches an agent without binary update; P2.8 test capped buffering and older responses; P2.9 close phase | P2.B | Inherited/snapshot/override cases remain distinct; old responses cannot overwrite new state; focused outage and phase gates pass | Not started |

## P3 — OS-specific baseline checks

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P3.A — Execution boundary | P3.1 Define executable/argument allowlist and privilege policy; P3.2 implement unprivileged exec without shell; P3.3 enforce time/output/working-directory limits | P2; distribution contract | Rejected binaries/arguments cannot execute; timeout kills only owned children; truncated output has explicit state | Not started |
| P3.B — Recipes | P3.4 Implement update observation recipe; P3.5 implement reboot-required recipe; P3.6 define and implement fstrim evidence semantics | P3.A | Each tested OS has clear applicability, success/failure/unknown mapping and fixtures; unsupported OS stays unknown | Not started |
| P3.C — Fleet workflow and closeout | P3.7 Add baseline assignment and attention views; P3.8 exercise central recipe revision without agent rebuild; P3.9 publish tested support matrix and close phase | P3.B | Real test-host observations explain attention; keyboard/narrow layouts and catalog-only text pass; phase gate complete | Not started |

## P4 — Self-hosted release quality

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P4.A — Data lifecycle | P4.1 Set retention/archive/delete rules; P4.2 implement bounded cleanup with audit; P4.3 verify backup and restore | P3; retention owner decision | Deletion respects references; restores reconcile counts and credentials; no unexplained data loss | Not started |
| P4.B — Notifications | P4.4 Select alert channels and consent/delivery policy; P4.5 implement idempotent dispatch and limits; P4.6 test failures in capture transport | P4.A; explicit external-communication adoption | Tests send nothing to real recipients; uncertain delivery is observable and not blindly retried | Not started |
| P4.C — Release rehearsal | P4.7 Package native control plane and agent; P4.8 rehearse install/upgrade/recovery on approved disposable resources; P4.9 complete release docs and phase gate | P4.B | New operator can deploy, enroll several hosts and recover from backup; exact release and rollback verified | Not started |

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
