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

Completed phase: **P0 — Scaffold**, accepted by the owner on 2026-09-28.
Next phase: **P1 — First connected host**. Resolve its decision gates before
starting dependent implementation. Future phases define intended scope, not
permission to start all later integrations or privileged operations.

## Phase overview

| Phase | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| P0 | Buildable, documented, verifiable non-product scaffold | Approved proposal | Complete |
| P1 | One securely enrolled host, persisted heartbeat and honest stale state | P0 accepted | Not started |
| P2 | Versioned assignments and disk observations end to end | P1 | Not started |
| P3 | Tested OS/package, reboot and fstrim recipes | P2; distribution selected | Not started |
| P4 | Usable self-hosted release with recovery and retention | P3 | Not started |
| P5 | Optional Proxmox context | P4; separate scope decision | Not started |
| P6 | Audited maintenance capability | P4; separate scope/security decision | Not started |

## P0 — Scaffold

| Batch | Tasks | Prerequisite | Acceptance and local evidence | Status |
| --- | --- | --- | --- | --- |
| P0.A — Contracts | P0.1 Configure repository identity and license; P0.2 establish canonical documents and phased task plan | Approved identities and scope | Paths/remotes/visibility verified; documents have one owner and linked decisions | Complete |
| P0.B — Runnable shell | P0.3 Build informational web shell with English catalogs; P0.4 add Go version/help placeholder; P0.5 document native-service configuration | P0.A | Web builds and starts on loopback; no fake host data; CLI refuses unsupported work; no persistent service starts | Complete |
| P0.C — Verification and review | P0.6 Automate inventory, size, literal-copy and prohibited-file checks; P0.7 verify toolchain and phase-closeout workflow; P0.8 record results and obtain scaffold acceptance | P0.B | Full applicable local gate passed; desktop/narrow and keyboard smoke passed; private lifecycle valid; owner accepted on 2026-09-28 | Complete |

Phase completion: accepted scaffold, linked evidence, no product behavior or
unresolved scaffold blocker. Publication and deployment are separate decisions.

## P1 — First connected host

Decision gates before implementation: select a tested Linux distribution, operator
authentication method, TLS origin and dedicated PostgreSQL ownership boundary.
Authentication and privacy belong to this phase before network exposure.

| Batch | Tasks | Prerequisite | Acceptance and local checks | Status |
| --- | --- | --- | --- | --- |
| P1.A — Access and contracts | P1.1 Define operator/agent trust and lifecycle; P1.2 specify enrollment/heartbeat schemas, status states and idempotency; P1.3 select typed SQL and migration tools | P0 accepted; decisions resolved | Versioned request/response and data contracts include unauthorized, expired, duplicate, revoked and stale cases; source-backed tool choices | Not started |
| P1.B — Protected enrollment | P1.4 Implement operator access boundary; P1.5 migrate host/agent/token/audit records; P1.6 implement one-time enrollment with hashed credentials | P1.A | Unauthorized operator calls fail; token consumed once under concurrency; repeat requests have explicit outcomes; audit and state commit atomically | Not started |
| P1.C — Heartbeat slice | P1.7 Implement bounded Go HTTPS client and configuration; P1.8 authenticate/store idempotent heartbeats; P1.9 render persisted current/unknown/stale host state | P1.B | One fresh test VM enrolls; a restart retains it; a frozen-clock test proves stale boundaries; credential cross-host access fails | Not started |
| P1.D — Recovery and closeout | P1.10 Test revoke/rotate and outage backoff; P1.11 document native install/TLS and recoverable release; P1.12 complete phase gate and review | P1.C | No credential in output; bounded retry state; fresh install/restart/missed-heartbeat journey verified; complete checks at closeout | Not started |

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
recorded in the private development memory. Product phases remain Not started.
