# P1 acceptance cases

These cases own the proof obligations for the selected access, protocol and data
contracts. P1.A reviews the design; P1.B–D implement and execute the cases. A design
review is not runtime evidence. Record implementation test locations/results here
as those batches land. Use synthetic data and injected time. PostgreSQL tests use
the reserved database on the existing instance; agent tests use the selected
disposable host. Phase-end scans and GitHub checks retain their existing cadence.

| ID | Owning batch | Required proof |
| --- | --- | --- |
| AC01 | P1.B | Concurrent operator-init yields one account; no default/web setup path; password input is hidden and absent from args/logs. |
| AC02 | P1.B | Correct/wrong/unknown login; scrypt parameters, Unicode/length boundaries, bounded hash concurrency and persistent login limiter across restart. Password reset racing login cannot create an old-authority session. |
| AC03 | P1.B | Session fixation prevented; cookie flags; idle/absolute equality edges, clock regression, logout, reset and five-session cap; every direct route/page loader uses the guard. |
| AC04 | P1.B | Cross-origin, null/missing Origin, sibling subdomain, simple forms, absent custom header and unsupported media all rejected; spoofed Host/forwarded headers cannot change trusted origin. No public fleet JSON/HTML/cache. |
| AC05 | P1.B | Fresh migration, no-op rerun, two concurrent migrator processes as `tinywarden`, injected migration failure rollback, foreign-key/check/unique constraints and actual driver type mapping. Check exact database/role/ownership before migration or fixture reset, refuse other test targets and check no PUBLIC access to project data. Verify owner capabilities honestly; DDL/audit denial is not a guarantee under the single-user contract. |
| AC06 | P1.B | Token issuance retry does not create a second token; lost issuance response exposes only token ID; mismatched request_id input conflicts; 20-active-token limit; expiry/revoke/unknown tokens produce safe outcomes. |
| AC07 | P1.B | Concurrent identical enrollment produces one host/agent/credential/audit and 201+200; changed replay conflicts; unrelated credential/request identity collision is rejected without altering its owner. |
| AC08 | P1.B | Enrollment commit followed by lost response/restart can replay the saved credential/request; no raw secret persists server-side. Exact expiry/replay-window edges and a token expiring while lock-waiting fail correctly. |
| AC09 | P1.B | Inject audit failure at init/reset/login/token/enrollment roots: associated mutation rolls back. Diagnostic output contains only allowlisted metadata and catalog-backed messages. |
| AC10 | P1.C | Disposable Debian 13 host enrolls outbound over validated HTTPS and sends heartbeat; control-plane and agent restarts retain identity and recover one pending request. Record tested architecture. |
| AC11 | P1.C | Same sequence+body replays without moving contact; changed equal/lower sequences fail; increasing sequence persists once. Concurrent/older delivery and client clock changes never overwrite newer accepted state. |
| AC12 | P1.C | Missing/wrong/type-confused/other-agent credentials and injected host_id cannot cross scope; revoked credentials cannot update contact. All unauthorized cases leave data unchanged. |
| AC13 | P1.C | Unknown before first contact, current before boundary, stale at exactly grace, revoked precedence, backwards server clock; read errors show unavailable. Current contact never implies healthy. |
| AC14 | P1.C | Fleet page has empty/loading/error/expired-session states, translated copy, keyboard/narrow use, bounded pagination, no hidden-tab or overlapping polling, and no older response overwriting newer data. Stale data cannot retain a current badge. |
| AC15 | P1.D | Operator-issued replacement preserves host/agent identity, swaps one active credential atomically, retains cadence and resets contact/sequence. Lost response recovers; racing old-generation tokens and revoked agents cannot replace authority. |
| AC16 | P1.D | Revoke races heartbeat/replacement: agent lock defines order; after commit old keys always fail; repeated revoke has no extra audit. Assert operator actor and explicit target agent/host, without an agent actor. Consumed-token revoke blocks replay without falsely claiming credential revocation. Audit-target upgrade and rollback proofs below are required. |
| AC17 | P1.D | Timeouts, 429/503, Retry-After, retry budgets, cancellation, TLS failures, redirects, oversized/chunked bodies, malformed JSON/responses and state corruption are bounded. No catch-up storm or credential forwarding. |
| AC18 | P1.D | Native install/restart and exact origin/config failure checks; dedicated resource ownership; backup/restore rehearsal and compatible code rollback or documented forward-repair path before live activation. |
| AC19 | P1.D | Phase gate and required final access/concurrency/recovery review pass; no known failed required case. Record omissions and deployment authority separately. |

## P1.D audit amendment proof requirements

Design selected 2026-09-28. The [audit contract](../architecture/data.md#audit-actor-and-target-representation)
adds an explicit target agent while retaining actor provenance. These checks extend
AC05/AC09/AC15–AC16 in P1.D; earlier P1.B acceptance remains historical evidence.
Implementation and runtime verification of this amendment are pending.

- Upgrade a populated 001 schema through migration 002 using the existing instance,
  reserved database and single owner login. Preserve all prior audit columns and
  related row counts; existing new-column values are NULL. Prove the documented
  interpretation of legacy enrollment/replacement targets without rewriting history.
- Verify fresh install, no-op rerun, concurrent migrators, explicit ordered ledger,
  failure rollback and legacy insert compatibility after expansion. Confirm the
  new target FK/index and ON DELETE RESTRICT; retain rejection of mixed actor IDs.
  Reject destructive downgrade; do not count a reset-only test as upgrade evidence.
- Assert complete audit fields for all nine action identifiers. Reject wrong actor
  combinations, missing/mismatched lifecycle targets and disallowed change fields
  at the owning boundary. Test explicit target queries separately from actor queries.
- For revocation, verify one event with the administrator actor, NULL agent actor,
  correct target agent/host and revoked=true. For enrollment/replacement, verify the
  agent actor equals the explicit target and the consumed token/host match. Retries
  do not duplicate events; inject audit failure to prove full lifecycle rollback.

Continue AC17–AC19 after these focused proofs. Full GitHub/security checks keep
their phase-end cadence; the design amendment does not itself satisfy runtime gates.

## P1.A contract review evidence

Review date: 2026-09-28. Trace the following paths through
[access](../security/access.md), [protocol](../architecture/agent-protocol.md),
[data](../architecture/data.md) and [configuration](../deploy/configuration.md):

1. Anonymous/browser/agent actors each reach only their own authority boundary.
2. Lost enrollment response: pending local key → one committed binding → same replay
   → no second record, audit or freshness update.
3. Concurrent different redemption: token lock serializes consumption; changed body
   conflicts; unique identities prevent cross-binding.
4. Revoke/replace/heartbeat: shared agent lock plus rechecked generation/authority
   determines order; replay never bypasses current revocation.
5. Last-sequence retry/out-of-order delivery: stored fingerprint and watermark preserve
   one contact snapshot; server receipt time, not agent time, drives freshness.
6. Expiry while waiting, backwards clocks, no heartbeat and exact stale boundary have
   explicit outcomes. Defaults are enrollment snapshots with named change semantics.
7. Application state+audit is atomic; unknown commit outcomes retain request identity;
   schema/runtime role/migration tools have a bounded implementation path.

All seven traces were reconciled for the selected contract; AC01–AC19 remain runtime
obligations for their owning batches. Official tool compatibility and licenses were
checked; dependency manifests and runtime source are unchanged by P1.A.

Documentation verification: local Markdown links, codebase map, source/prohibited-file
inventory, whitespace and private lifecycle checks. Snapshot/evidence identifiers
belong in the master-plan ledger and private work evidence. No scan, live database,
service activation or production behavior is claimed by this design acceptance.

## P1.B single-user contract amendment

Amended 2026-09-28 after the owner selected one PostgreSQL login and the existing
instance for tests. The [ownership contract](../architecture/data.md#postgresql-ownership-and-test-targets)
replaces the separate runtime/migrator requirement. AC05's former DDL/audit-denial
obligation is superseded, rather than counted as a passed check. Audit atomicity,
application authorization and AC01–AC09's other failure/concurrency obligations remain.
No database-owner tamper-resistance is claimed. This amendment is reflected in the
P1.B implementation and executed tests below.

## P1.B runtime acceptance

Executed 2026-09-28 against `tinywarden_test_p1b` on the existing PostgreSQL 18.6
instance as the single `tinywarden` login. The focused command in
[verification](verification.md#check-matrix) passed all 19 tests in four files.
Each fixture suite checked the connected database, session/current role and owner
before resetting synthetic data. No live database was migrated or reset.

| Cases | Executed evidence |
| --- | --- |
| AC01–AC02 | `p1b.integration.test.ts`, `p1b.boundaries.test.ts`, `p1b.cli.test.ts`: concurrent initialization, hidden terminal input, scrypt parameters, correct/wrong/unknown login, password bounds/hash concurrency, durable throttle and reset/login race. The CLI has no HTTP setup route or password argument. |
| AC03–AC04 | `p1b.integration.test.ts`, `p1b.boundaries.test.ts`: session cookie and limits, idle/absolute/clock edges, logout/reset, origin/header/media/body/version rejection, and unauthorized fleet capability. The only page is informational; no fleet loader exists. |
| AC05 | `p1b.migrations.test.ts`: two first-install migration processes, no-op rerun, wrong target refusal, failed migration rollback, SQL constraints, pg bigint/timestamp mapping and revoked PUBLIC access. |
| AC06–AC08 | `p1b.integration.test.ts`, `p1b.boundaries.test.ts`: issuance retry, active-token cap, revoke/expiry, concurrent 201+200 enrollment, cross-token collisions, restart replay, 24-hour edge and expiry while waiting on a row lock. |
| AC09 | `p1b.integration.test.ts`, `p1b.boundaries.test.ts`: injected audit failure rolls back init, login, reset, issue, revoke and enrollment. Error logs expose allowlisted metadata; local CLI copy is catalog-backed. |

The optimized Next build compiled all six API routes. A temporary loopback server
returned 401 for anonymous session and token requests and 403 for cross-origin
login, each with a versioned uncached response; it was stopped afterward. Web lint,
typecheck, source-size, map and catalog-only JSX checks passed. Deployment readiness,
agent enrollment from a real Debian host, heartbeat, fleet UI and phase-end
dependency/security/GitHub checks remain assigned to P1.C–D.

## P1.C acceptance

Executed 2026-09-28 against the guarded `tinywarden_test_p1b` database on the
existing PostgreSQL instance. The 27-test web batch passed across six files;
`p1c.server.test.ts` contributes six focused heartbeat/inventory cases. Go agent
tests and vet passed on the local development host. The optimized web build compiled
the heartbeat, fleet list/detail, login and guarded page routes. No live application
database was migrated and nothing is listening on the reserved port `10007`.

| Cases | Local evidence and remaining proof |
| --- | --- |
| AC10 | Go TLS fixture proves pending enrollment/heartbeat replay across state close/reopen, strict TLS, redirect and body limits. An owner-provided disposable Debian 13.4 x86_64 VM verified a temporary test CA over HTTPS, enrolled, and sent heartbeat sequences 1 and 2 across agent/control-plane restarts without changing host or agent ID. With the test server unavailable, it persisted sequence 3 as pending; after another restart, sequence 3 was accepted and the pending record cleared. Only the owned test database and loopback test endpoint behind an SSH tunnel were used. The public deployment path is P1.D. |
| AC11 | `p1c.server.test.ts` proves first receipt, identical replay, changed equal/lower sequence rejection, concurrent higher/lower delivery and backwards server clock. The persisted watermark and receipt remain stable. |
| AC12 | The same test rejects absent/wrong/type-confused credentials and injected host authority without advancing contact, and rejects a revoked agent. |
| AC13 | The same test proves unknown/current/stale at the exact boundary, backwards clock, revoked precedence, health unknown, pagination and a failed database read returning 503 rather than an empty fleet. |
| AC14 | Loopback Chromium review at 1440×900 and 390×844 exercised synthetic current/stale rows, detail navigation, refresh, a 503 outdated state and 401 session loss; no document overflow or page errors. Source review verifies single in-flight polling, hidden-tab pause, monotonic freshness expiry and catalog-backed copy. The guarded fleet API also returned the actual VM host as current after sequence 3, with health unknown. |

The concept/screenshot comparison and exact VM procedure are in private P1.C
evidence. This is acceptance on isolated test resources; P1.D owns credential
replacement, public native service activation/recovery and phase-end security/GitHub
checks.

## P1.D local acceptance and closeout evidence

Executed 2026-09-28 with the existing PostgreSQL 18 instance and guarded
`tinywarden_test_p1b` database. The first web suite passed 35 tests in eight files,
including five lifecycle and two audit-shape tests. After the review findings
below were repaired, the final local phase gate passed 39 tests in nine files,
including four held-lock session timing cases. Go tests, race-focused agent tests
and vet passed. The final Astra review accepted all findings, including the R1a
follow-up. Source and evidence are in the local P1 commits; GitHub checks remain
pending publication.

| Cases | Local evidence and limits |
| --- | --- |
| AC15 | `p1d.lifecycle.test.ts` proves replacement preserves host/agent IDs and cadence, advances generation once, resets contact/sequence, rejects old credentials and stale-generation tokens, and replays the saved request once. `replacement_test.go` proves the agent persists an uncertain replacement through process restart, retries the same request/secret and sends its next heartbeat with the new credential. |
| AC16 | The same web file proves revoke/heartbeat and revoke/replacement races, terminal credential denial, repeated revoke without another audit and audit-failure rollback. It asserts the operator actor, separate target agent/host and NULL agent actor. `p1d.audit.test.ts` covers all nine permitted action shapes and rejects mixed actors, missing/mismatched targets and disallowed fields. |
| AC05/AC09 amendment | `p1b.migrations.test.ts` upgrades a populated 001 schema to 002 through two concurrent migrators, preserves the original audit row and counts, accepts a legacy insert, rejects a dangling target and deletion of a referenced agent, keeps actor-kind checks, verifies both migration names, clean install/no-op and refuses a destructive down. Audit-failure fixtures prove lifecycle mutation rollback. No production schema was changed. |
| AC17 | `agent_test.go`, `protocol_test.go`, `protocol_status_test.go`, `replacement_test.go` and `state_recovery_test.go` exercise TLS refusal, redirect denial, bounded oversized/chunked and malformed responses, interrupted bodies, terminal status/header precedence despite truncated bodies, 429/503 with capped Retry-After including the fifth-failure degraded wait, request timeout/cancellation, private-state corruption and saved-request recovery across versions. No real external recipient or provider was contacted. |
| AC18 | Two native unit templates passed syntax verification. A production build started, stopped and restarted on temporary loopback port 31883 using the test database: home 200, anonymous session 401 and cross-origin login 403; restart returned 401 again. A custom-format synthetic database dump restored to a new disposable database on the existing PostgreSQL instance: operator/host/agent/credential/token/audit/migration counts matched `1/5/5/9/11/26/2`; 12 audit rows had explicit target agents; PUBLIC database/schema/audit update privileges were false and the target-agent FK remained restrictive. The restored copy supported operator login, token issue, enrollment and fleet reading, then was removed. Actual systemd installation, live backup, hostname routing and port 10007 require separate deployment authority. |
| AC19 | `./scripts/verify.sh --phase-end` passed after the R1a repair: reproducible npm install, 116-path map, source/localization rules, 39 web tests, Go tests/vet/build/module integrity, production web build, both native unit templates, npm audit (zero vulnerabilities), govulncheck (none found) and staged secret scan (no leaks at the tested index). Astra accepted all final-review findings; this local commit preserves the exact source/evidence. GitHub checks await a published exact commit and separate publication authority. |

The earlier P1.C browser review remains historical evidence. P1.D later changed
the fleet request lifecycle, so that affected flow received a new browser check
below. At the isolated P1.D check, the public origin returned HTTP 502 with no
TinyWarden process on port 10007. Local acceptance does not establish live deployment.

## P1.D review disposition

2026-09-28: **local review accepted and committed**. The initial
review identified five bounded repair areas, now accepted after the follow-ups
below. Detailed diagnostics are retained privately; the repair proof obligations
are listed here. Earlier automated and browser passes remain historical evidence.

| Area | Required additional acceptance |
| --- | --- |
| Transport recovery — AC08/AC10/AC15/AC17 | Interrupted response bodies and timeouts after headers retry the exact saved enrollment, replacement or heartbeat request; terminal protocol/TLS failures still stop. |
| Retry timing — AC17 | Valid excessive Retry-After values cap at 900 seconds. Every next attempt respects the last response delay, including entry to degraded mode; cancellation and the cycle bound remain tested. |
| Pending request compatibility — AC08/AC10/AC15/AC18 | Upgrade/restart preserves complete pending input and its original agent version; known legacy state upgrades durably; subsequent new requests use the current version. Code rollback states its verified file-format boundary. |
| Effective session time — AC03/AC06/AC16 | Domain lock waits crossing original idle/absolute expiry reject the operation without activity renewal, mutation or audit; test equality, no-op and clock regression cases. |
| Fleet request lifecycle — AC14 | A 15-second total read deadline releases stalled requests; localized unavailable/outdated state and explicit recovery work. Session loss/logout stops further polling, and superseded responses cannot restore data. Verify the affected desktop/narrow browser flow. |

The Sol repair pass added interrupted-body recovery for enrollment, replacement and
heartbeat; capped Retry-After parsing and fifth-failure scheduling; durable
pending-request version recovery; final session-time checks after domain locks; and
a 15-second fleet read deadline with terminal session-loss behavior. Focused Go
tests and four PostgreSQL held-lock tests pass. The latter cross absolute and idle
expiry at equality, including a revoked-token no-op, and reject a backward clock
without session renewal, target mutation or audit.

Browser plugin was unavailable, so Playwright with local Chromium reviewed the
rendered fleet at 1440×900 and 390×844 against the owned test database and a
stopped loopback Next server. Controlled stalled headers/body released after the
15-second deadline; refresh recovered, 401 cleared the data and stopped later
timer/visibility requests, and successful logout stopped a pending read. Both
widths had no document overflow or page exception.
Synthetic session fixtures were removed afterward. Captures and details are in
private development evidence. The final local phase gate passed as recorded above;
no live deployment, exact committed release or GitHub success is established.

The subsequent Astra re-review accepts the retry-delay, pending-version, effective
session-time and fleet-lifecycle repairs. Independent simulated-time checks covered
ordinary and consecutive degraded waits; a simulated newer agent recovered both
legacy enrollment and replacement, durably preserving original input before replay
and using the new version on its first acknowledged heartbeat. The older binary's
strict state-reader limit is now explicit in the protocol and deployment documents.

The owner-confirmed Sol follow-up now classifies terminal HTTP status and invalid
success headers before fallible body reads. New local TLS regressions cover truncated
400/401/403/404/409/413/415, invalid success media/encoding, unsupported success
status, unexpected heartbeat 201, and retryable interrupted 200/201/429/503 with
capped Retry-After. The final Astra review accepted this path and its direct and
transitive consumers. Independent local TLS tests exercised the actual running
agent with stalled responses across enrollment, replacement and heartbeat: all
37 cases stopped after one request without entering degraded mode and retained
byte-identical private state. The production client's TLS verification remained
enabled with an isolated fixture CA. CLI errors remain catalog-backed and the
native unit does not restart ordinary terminal exits. No unresolved review finding
remains; the previously gated source bytes are unchanged. The local commit
preserves this reviewed state. Live activation and GitHub execution retain the
separate limits recorded above.
