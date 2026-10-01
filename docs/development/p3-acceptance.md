# P3 acceptance and execution-contract traces

P3.1 design selected 2026-09-29. This record distinguishes reviewed contracts
from executed proof. [Recipe execution](../architecture/recipe-execution.md) and
[baseline observations](../architecture/baseline-observations.md) own behavior.
The [master plan](master-plan.md) owns batch status and sequencing.

Local P3 accepted 2026-09-30 after the final phase gate and required repair
re-review. [Final disposition](#p3c-final-review-and-local-acceptance) closes
all three findings. The separately authorized live deployment was accepted the
same day; see [live acceptance](#live-deployment-acceptance). Commits and publication
remain separate steps.

## Required implementation evidence

| ID | Batch | Acceptance |
| --- | --- | --- |
| A01 | P3.A | Validate the complete recipe before launch. Reject unsupported profile, reordered/extra argv, missing simulate flag, shell/interpreter, alternate unit/path, environment/cwd/stdin/user field, duplicate JSON key/step, bad version/encoding and excessive input. Prove zero process launches for whole-recipe rejection. |
| A02 | P3.A | Identity/path checks reject root/capability-bearing execution, writable or non-root binary/ancestors, symlink/script/setuid/capability executable and unavailable tool without escalation. Execute supported native tools as an ordinary account with no_new_privs, fixed cwd/environment, null stdin and no parent-secret/credential descriptors. |
| A03 | P3.A | A synthetic command's success, nonzero exit and signal are preserved independently of the supervisor exit. Recipe deadline/cancellation stops later steps and remains independent of heartbeat work. Frozen/injected scheduling proves no concurrent recipe or catch-up burst. |
| A04 | P3.A | Synthetic child and grandchild: timeout, leader early exit, output flood, retained output descriptor, parent death and malformed/early supervisor output leave no ordinarily killable child. An unrelated sentinel process survives. Prove no destructive group signal after reaping; fault-injected unreaped/remaining group retains the slot without accumulating processes. |
| A05 | P3.A | stdout and stderr have independent exact caps; one-byte overflow terminates with explicit truncation. Concurrent readers/control completion produce one immutable outcome, no data race, unbounded buffer or indefinite pipe wait. No raw output/secret appears in CLI diagnostics. |
| B01 | P3.B | APT fixtures cover no updates, upgrades, held-back/new dependencies, unexpected removals, broken/empty/inaccessible lists, changed local state, output mismatch, truncation and failure. Zero summary is distinguished from missing summary and from verified index freshness. No package operation occurs. |
| B02 | P3.B | Reboot fixtures cover present marker, absent marker, no verified producer, inaccessible path and unexpected command exit. Absence is never advertised as a universal reboot guarantee. |
| B03 | P3.B | fstrim fixtures cover missing/disabled/inactive timer, skipped container condition, never-run service with default success, real success/failure, lost history, clock/boot changes and inconsistent timer/service evidence. No trim or systemctl mutation is invoked. |
| B04 | P3.B | Each typed normalizer/evaluator has versioned fixtures and strict size/range/encoding handling. Raw output is removed before persistence/upload. Unsupported OS/tool/capability/output remains unknown; catalogs own all user-facing reasons. |
| C01 | P3.C | Additive schema, exact wire/digest and optimistic/idempotent audited recipe/policy edits pass scope, rollback, concurrent delivery and stale-edit cases. Global changes follow inheritance while pinned overrides and old snapshots retain meaning. Test only on the reserved database in the existing PostgreSQL instance. |
| C02 | P3.C | Real disposable-host package/reboot/fstrim evidence reaches the UI with honest scope and unknown/stale cases. Central APT simulation-mode revision reaches the same binary, then restores the original setting; old history retains its recipe. Disk and heartbeat continue. |
| C03 | P3.C | Duplicate/out-of-order/old-generation results, endpoint skew, restart, capped queue, expiry and restore-regression latch cannot create false current health. Sequence survives interruption; retained ambiguity is never reissued under new identity. |
| C04 | P3.C | Operator sees baseline summary, details, provenance, edits/conflicts and history with catalog text, keyboard access and narrow layouts. Unknown coverage does not hide known attention. Phase-end full/security checks and final execution-boundary review pass; live activation/publication authority is recorded separately. |

P3.A process fixtures must be test-only and must not add an environment or wire
bypass to production validation. Use a synthetic Go helper for hostile process
behavior; the product never allows a shell merely to make testing convenient.
Test parent death and unrelated-process survival with explicit fixture ownership.
Do not run actual upgrade, trim or reboot commands in acceptance.

## P3.1 design review

The following are contract traces, not executed runtime tests:

| Trace | Reviewed consequence |
| --- | --- |
| A valid central recipe adds `-o`, a package name or a service mutation | Whole recipe fails exact argument/profile validation before any command starts, even with valid agent authentication. |
| A new central revision changes APT simulation mode | Existing capability supports it; immutable snapshot identifies the mode. The former observation is historical immediately for inherited policy; an override remains pinned. |
| A child exits while its descendant still holds stdout | Separate supervisor control reports the direct exit; the retained leader anchors group cleanup before reaping and bounded readers cannot wait forever. |
| A deadline races normal completion and a flood on stderr | One owner resolves outcome after execution and stream evidence; overflow/timeout prevents success. Separate caps prevent stderr bypass and returned buffers stop mutating. |
| The supervisor dies early or a task remains kernel-blocked | Retained child identity permits one owned cleanup signal; incomplete cleanup holds the slot while heartbeat continues. No replacement-process accumulation. |
| APT reports zero but cache freshness is unknown; reboot marker is absent | Observations preserve those limits; neither becomes an unqualified up-to-date/no-reboot claim. |
| fstrim timer has fired but service result is its default success | Require real service evidence and condition/timing consistency; timer history alone cannot prove successful trim. |
| Restored server loses baseline snapshot while old health remains | Durable generation-scoped baseline recovery latch overrides current health and future empty-cache fetches. Replacement requires new delivery and fresh evidence. |

## P3.A implementation evidence

Implemented 2026-09-29 on Debian 13 Linux amd64, Go 1.27.1, as the ordinary
project account. `agent/internal/runner` owns eight production files and eight
focused test files. The fixed CLI supervisor dispatch uses the current binary;
no environment or recipe field selects synthetic test commands.

| ID | Executed proof |
| --- | --- |
| A01 | `TestWholeRecipeRejectionLaunchesNothing` instruments the process factory and proves zero launches for whole-recipe rejection, including a later invalid step. `TestExactProfileArrays` covers every permitted array and missing/extra arguments. Strict decoding also requires exact field names and rejects duplicate keys before struct decoding. |
| A02 | `TestUnprivilegedIdentity` and `TestExecutableAndAncestorTrust` cover unsafe/unverifiable identity, ancestor/binary modes, capabilities, symlink, native-format and missing-tool boundaries. `TestRealNativeToolAndCleanCommandContext` executes the real `/usr/bin/test`, verifies clean environment, `/`, null stdin, inherited no_new_privs and exclusion of an intentionally inheritable synthetic secret descriptor. `TestProductionCLISupervisor` builds a disposable real agent executable and exercises its fixed dispatch and pipe numbering. |
| A03 | `TestDirectCommandEvidence` preserves success, nonzero exit and signal independently of the supervisor's cleanup SIGKILL. `TestDeadlineCancellationAndIndependentWork` rejects 20 concurrent caller ticks immediately while a worker owns a sleeping child; no rejected request is queued. `TestRecipeUsesOneWholeDeadline` expires the second sequential step within the original budget and never starts the third. Connected heartbeat scheduling remains P3.C acceptance. |
| A04 | `TestDescendantsAndUnrelatedSentinel` proves timeout, early direct exit with a retained output descriptor, descendant output flood and early/malformed supervisor cases clean owned groups while an unrelated process survives. `TestParentDeathKillsSupervisorAndDescendants` proves private-pipe EOF cleanup before the 30-second budget. `TestSupervisorWatchdogAndExtraFrameData` independently proves watchdog and extra-byte cleanup; `TestInvalidFramesCannotLaunchCommand` rejects malformed frames. `TestKillPrecedesReapingAndPendingCleanupHoldsSlot` instruments kill/wait order and injects unreaped/remaining-group states: the slot stays held, repeated requests start no replacement, and recovery adds no destructive signal. |
| A05 | `TestIndependentExactOutputCaps` permits exact separate 64 KiB/16 KiB streams, rejects one-byte overflow/flood with explicit bounded prefixes and stops later steps. Returned buffers are reader-owned until final evidence, then immutable; the race suite covers their ownership and control completion. `TestRawOutputCannotEnterJSONEvidence` excludes raw buffers from serialization. CLI tests reject unsupported arguments without echoing their synthetic secret. |

Passed from `agent`: `go test ./internal/runner ./internal/cli`,
`go test -race ./internal/runner`, `go vet ./internal/runner ./internal/cli`
and formatting checks. There are 16 substantive runner tests plus one test-only
fixture dispatcher, and the CLI acceptance test. The integration test builds its
real executable under `t.TempDir()` and removes it after completion.
Inventory/map and source limits pass for 173 Git-owned paths. The largest added
handwritten file is `process.go` at 198 physical lines. Local document links,
whitespace and private lifecycle validation pass.

Identity and file-capability rejection use synthetic status/metadata probes rather
than changing host privilege or tool permissions. Uninterruptible kernel I/O is
represented by retained-wait/group fault injection. Ordinary child/grandchild,
parent-death and watchdog behavior is exercised with real owned processes.
P3.A adds no recipe scheduler or catch-up queue; connected service, database,
UI and disposable-host baseline proofs remain P3.B/C. Phase-end security/GitHub
checks and the mandatory Astra execution review remain P3.C gates. No deployment,
commit or publication is part of this batch.

## P3.B implementation evidence

Implemented 2026-09-29 on GPT-6.1 Sol XHigh. Six production files in
`agent/internal/baseline` own fixed recipes and typed normalizers; three pure
`server/checks/baseline-*` modules own validation/types and server evaluation.
The [normalizer contract](../architecture/baseline-normalizers.md) defines exact
formats, ranges, window/boot inputs, versions and qualified meanings.

| ID | Executed proof |
| --- | --- |
| B01 | 17 shared APT cases cover zero/missing/duplicate summary, upgrades/held-back/new dependencies/removals, empty or inaccessible cache, changed local state, broken package state, diagnostic output, changed/reinstall presentation, count range and truncation. Cached zero is unknown; positive changes warn with incomplete freshness/consistency. A synthetic URL/token preamble is discarded. |
| B02 | Five shared marker cases cover present, not observed, inaccessible traversal, unexpected exit and unexpected output. Producer assurance remains unverified in every v1 result; exit 1 does not claim a universal no-reboot state. |
| B03 | 20 shared systemd cases cover completed success, disabled/inactive/missing timer, skipped condition, never-run default success, actual failure/running service, new unconfirmed trigger, lost condition history, unavailable realtime schedule, boot/clock changes, read-window races, future/reversed timestamps, expired schedule, wrong ID, malformed and fractional timestamps. Additional tests reject unverifiable windows and transitional/maintenance service state as healthy evidence. |
| B04 | Both languages consume the same 42 authored v1 JSON cases: Go compares complete raw-input normalization against expected typed observations; TS validates and evaluates those observations against expected assessments. Boundary tests reject recipe/version/composition errors, encoding/NUL/control characters, size/range overflow, missing/contradictory status, unsupported evaluator/normalizer, arbitrary/raw fields and invented cache/reclamation assurance. Normalized status is copied and raw buffers cannot enter JSON. Every server reason has English catalog copy. |

Passed: `go test ./internal/baseline`, `go test -race ./internal/baseline`,
`go vet ./internal/baseline` and formatting. Seven Go test functions include the
42 shared cases and boundary tables. Web focused tests
`tests/p3b.baseline.test.ts` and `tests/p3b.values.test.ts` pass 50/50.
ESLint and `tsc --noEmit --incremental false` pass. TypeScript uses existing
generated route types without invoking Next type generation or a web build in
the serving checkout. Source/map covers 231 paths and literal-copy checks pass.
Local document links, both repositories' whitespace and private lifecycle
validation pass.

All package/reboot/fstrim acceptance inputs are synthetic fixtures, not host
actions. Read-only property probes on the approved Debian 13 VM confirmed the
mixed calendar/epoch output and unevaluated/default service history. No upgrade,
APT refresh, trim, reboot, schema, installed binary, service restart or capability
advertisement occurred. Format mismatch fails conservatively; unsupported OS
and missing capability applicability, connected scheduling, delivery, current
freshness and real-host UI proof remain P3.C. The ordinary P3.C final Astra
review and phase-end security/GitHub cadence are retained.

## P3.C implementation evidence

Implemented locally 2026-09-30 on owner-confirmed GPT-6.1 Sol XHigh. The
[baseline integration contract](../architecture/baseline-protocol.md) fixed exact
wire, canonical digest, additive SQL and private state before their consumers.
Migrations 006/007 introduce eight baseline tables and typed audit fields; all
001–005 remain unchanged. Shared Go/TS authored fixtures exposed a `step_id`
wire mismatch in the initial TS recipe builder; it was corrected before host
proof. Final phase gates and mandatory Astra review are recorded separately.

| ID | Executed proof and limits |
| --- | --- |
| C01 | Guarded existing-instance tests cover seven migrations, preserved populated P1 actor/target history, three audited baseline seeds, SQL bounds, exact field/encoding/digest shapes, operator/origin and agent scope, immutable delivery/history, inherited revision and pinned overrides, unchanged-save pin, optimistic/idempotent receipts, stale/conflicting edits, rollback on audit failure and concurrent delivery/edit. P2 full-suite compatibility is part of the phase gate. No live schema changed. |
| C02 | A temporary root-owned test executable ran the ordinary production coordinator/runner as the existing non-root account on the approved Debian 13/amd64 VM, using a fresh reserved-test identity and explicit test-only CA over a loopback TLS reverse-forward. Actual cached APT, reboot-marker and fstrim property observations reached the test UI. Central APT mode `upgrade` → `with-new-pkgs` → `upgrade` reached the same executable; old history retained sources 1/2/3 and mode. Two 160-second runs passed across state-preserving restart; heartbeat advanced and two complete disk runs were accepted. Installed P2 service stayed active. Temporary remote files/forwarding were removed. This is disposable connected proof, not an installed-agent/live upgrade. |
| C03 | Fifteen focused Go tests plus database cases cover exact replay/first receipt, out-of-order/latest unknown, generation rejection/recovery, missing/equal-divergent snapshot latch committed before conflict, empty-cache bypass refusal, endpoint 404 skew, state-preserving restart/crash windows, queue 100/1MiB cap with in-flight retention, corrupt/missing/unsafe state preservation, old-generation archival, fair scheduling/no catch-up/held slot, lease deadline/backwards-wall durable pause, 503 exact retry, 401 priority and active recipe captured through a new fetch. Race checks pass. Inconsistent active/queued identity is rejected, and an in-flight fetch cannot renew a clock-paused lease. |
| C04 | Actual rendered desktop 1440×1000 and narrow 390×844 pages pass identity, one heading/main, visible scoped observations, original history, no overflow and zero page errors. Browser interactions prove global stale-edit conflict/review, retained draft, associated bounds error, discard, dirty refresh, byte-identical uncertain-save retry, host override/inherit, keyboard focus, current expiry to unknown with retained warning, failed refresh/history, initial unavailable and permission-hidden editors. Baseline-specific copy is catalog-backed; no generic command editor. Full phase/security checks pass; mandatory Astra review remains unfinished. |

The explicit VM test is skipped by default; only the two configured executions
count as C02. Its test-only supervisor/disk-helper dispatch runs the real fixed
helpers; no production environment or wire bypass was added. The test executable
had SHA-256 `db1b04911be4d88525047f035c13b57b530e274247c5d30bec14a159c45bc458`.
Subsequent local changes tighten restart identity/clock-pause checks and baseline
copy; the final phase gate fingerprints the complete source separately. No APT
index refresh, upgrade, trim or reboot was executed. Browser scripts initially
used incorrect selectors and a too-short mode-readback wait; harness corrections
were followed by successful readback, not recorded as product failures.

Actual host outcomes were conservative: cached zero APT remained unknown,
a present package reboot marker warned with unverified completeness, and absent
completed trim history remained unknown. Temporary preview database identity,
credentials and test CA are private ephemeral artifacts outside the repositories.
The production service/agent were independently active and public login returned
200 after remote test cleanup. P3 activation, commit and publication are pending
separate authority under the [upgrade proposal](../deploy/p3-live-upgrade.md).

### Supported observation matrix

| Environment/evidence | Tested behavior |
| --- | --- |
| Debian 13, Linux amd64, ordinary non-root native VM | Real connected package/reboot/fstrim, heartbeat/disk coexistence, unchanged-binary central mode revision and restart. |
| Other OS/architecture or missing capability | Strict delivery applicability and local capability guards; current health remains unknown. No real non-Debian support claim. |
| Missing/untrusted tool or unsupported output | Runner identity/tool fixtures and normalizer failures; typed unknown, no privilege escalation. |
| Empty/old APT cache; optional reboot marker; missing/default systemd history | Shared fixtures and real VM evidence preserve incomplete assurance. No repository-freshness, universal reboot or physical reclamation claim. |
| Container-specific trim conditions | Shared skipped-condition fixtures only; no real Debian CT acceptance was performed. |

P3.7/P3.8 local integration and support documentation are implemented. P3.9
completion remains dependent on the full phase gate and mandatory main-chat
GPT-6 Astra XHigh execution-boundary review. GitHub and live release acceptance
are distinct from local phase completion.

### P3.C phase-end verification

The unchanged `./scripts/verify.sh --phase-end` passed on the independent
verification copy with exactly 284 owned paths and temporary-index tree
`1e8b43ae0d13d15f1ec10acade244fa863ab8e77`. All 139 web tests in 20 files ran
(no skipped DB tests); all Go packages, formatting, vet, executable build and
module integrity passed. Three verification-regression tests, source/map/catalog,
ESLint, route types/TypeScript, clean locked install, Next production build and
systemd unit validation passed. npm audit reported zero vulnerabilities,
govulncheck none and the exact-index Gitleaks scan no leaks. Focused baseline
agent race tests also passed. Subsequent changes update documentation/private
evidence only; no runtime/config/tooling fingerprint changed.

The initial full suite exposed old fixture reset lists missing baseline FK tables
and an old P2.A clock preceding newly seeded data. Four guarded test cleanup
lists and relative test clock were repaired, then all cases and the full phase
entry point passed. These are compatibility-harness repairs. Local Markdown links
and both repositories' whitespace/lifecycle checks pass. GitHub checks were not
run because no publication is authorized. Main public login 200, user service
active and installed VM P2 service active were independently rechecked; live
ledger remains exactly 001–005. The subsequent review below records the remaining
P3 completion gate. The upgrade proposal still needs separate operational approval.

### P3.C Astra review

Reviewed 2026-09-30 on owner-confirmed GPT-6 Astra XHigh. Changes required;
P3.C/P3.9 remain open. All 247 runtime/config/tooling fingerprints match the
phase-tested input above. No implementation changed during review. The existing
full-gate pass remains evidence for the cases it covers; focused review-only Go
reproductions in the independent copy exposed two additional failure paths.

| ID | Finding and required repair | Acceptance for the repair |
| --- | --- | --- |
| R1 | Baseline fetch/upload receive paths return a pause-file write error instead of the original HTTP 401. The scheduler then disables only that lane instead of stopping all authenticated work. The disk-assignment wrapper has the same error replacement. Preserve the authoritative 401 classification through pause persistence failures, while retaining the local error for diagnosis. | Force pause-write failure for baseline fetch/upload and disk assignment; prove global cancellation, including an active recipe, still occurs. Ordinary non-401 baseline faults must retain their lane-local behavior. At review, both baseline reproductions returned `*os.LinkError` with no recoverable 401. |
| R2 | Restart initializes only the in-memory last-wall clock. A persisted cache validated in the future is temporarily unleased, but a successful fetch replaces that timestamp without the required durable backwards-clock pause. Detect the known rollback before response renewal or work allocation. | Restart with a future persisted validation time, then supply a valid response: retain the original validation evidence, persist the pause, launch no recipe and keep the pause across another restart. Preserve normal fresh startup and explicit generation-change recovery. At review, the reproduction renewed the timestamp and left the lane unpaused. |
| R3 | The agent unit omits the contract's explicit `KillMode=control-group`, `SendSIGKILL=yes` and `TimeoutStopSec=5s`. The upgrade proposal says to preserve the unit and does not install these required changes. Add the settings and make reviewed unit installation/reload/readback explicit in the later approved release procedure. | Validate the prepared unit and exact required values. Keep its non-root identity, `NoNewPrivileges=true`, state/configuration and terminal-error restart behavior. No installed unit change or service restart is needed for this repair. |

R1 follows the [all-lane 401 rule](../architecture/baseline-observations.md);
R2 follows the [durable clock-pause contract](../architecture/baseline-protocol.md);
R3 follows the [native cleanup contract](../architecture/recipe-execution.md).
The review also traced exact argv/profile policy, privilege/tool checks,
supervisor ownership and kill-before-reap cleanup, retained slot, output/deadline
bounds, typed-only results and connected snapshot/queue/recovery consumers.
No additional blocking finding was established in those paths.

The review required confirmed Sol repairs, focused regressions and one final
phase gate, followed by confirmed Astra re-review of findings and affected
consumers. Retain unchanged VM/UI evidence unless a repair affects its claims. No live schema,
installed service, VM state, commit or publication was changed by this review.

### P3.C Sol repair verification

Repaired and verified 2026-09-30 on owner-confirmed GPT-6.1 Sol XHigh. R1 preserves
the original terminal error and pause-write failure together, keeping HTTP 401
visible to the coordinator. R2 restores the known wall-time boundary from saved
validation before first-tick renewal/allocation. R3 adds the three exact unit
settings and the reviewed-unit install/reload/effective-value release procedure.

| ID | Verified behavior |
| --- | --- |
| R1 | Both baseline receive paths preserve the 401 and filesystem cause, cancel an active mock recipe and stop the coordinator before later work. Actual Run/TLS disk-assignment rejection with cache-save failure also stops before later requests. A non-401 404 failure still disables only the baseline lane. |
| R2 | Future saved validation causes durable pause before a valid response can renew or launch. Another restart retains the evidence and pause. New generation archives old state and accepts fresh authority; normal restart still renews and starts the mock worker. |
| R3 | Prepared unit values match required identity, NoNewPrivileges, KillMode, SendSIGKILL, five-second stop limit and Restart. Both native templates pass systemd syntax validation. The installation/readback is prepared for a separately approved release. |

The original Astra reproduction tests both pass against the repaired source.
Eight named new/affected Go tests pass under the race detector; owning vet and
format checks pass. The unchanged full phase entry point passes on temporary-index
tree `bb499726f850d94583d48242fecd1c2a7f45ae21` with 286 owned paths:
139/139 web cases in 20 files, all Go tests/vet/build/module integrity, verification
regressions, source/map/catalog, lint/types, locked install, Next production build,
units, dependency audits and exact-index secret scan. Dependency audits report no
vulnerabilities; the redacted secret scan reports no leaks. The 249-path repaired
runtime/config/tooling fingerprint is retained privately; later edits are
documentation/evidence only. No web/schema/UI/runner profile changed in this repair.

The final phase gate ran in an independent copy; existing-instance database tests
used only the reserved synthetic target. No new VM execution was needed for these
bounded agent regressions. Main service PID/start time remain unchanged. Required
Astra re-review is pending; P3.C/P3.9 are not accepted yet. Activation and
publication remain separately authorized actions.

### P3.C final review and local acceptance

Accepted 2026-09-30 on owner-confirmed GPT-6 Astra XHigh. All 249 repaired
runtime/config/tooling fingerprints match the phase-tested source at
`bb499726f850d94583d48242fecd1c2a7f45ae21`. Complete retained phase output and
its recorded digest match. Re-review traced the repair diffs and their tests
through the affected consumers and established no additional blocking finding.

R1 is accepted: terminal 401 remains discoverable through joined persistence
errors, preserving coordinator stop and active recipe cancellation; non-401
faults retain lane isolation. R2 is accepted: validated saved time seeds the
first-tick wall boundary before response renewal/allocation; durable pause and
generation recovery preserve evidence. R3 is accepted: prepared unit values meet
the explicit cleanup contract and the release procedure installs, reloads and
checks their effective values.

The existing focused/race, original reproduction replay and full phase evidence
remain valid against unchanged repaired source. No additional test, scan, build
or VM/UI rerun was needed for documentation-only review closeout. A01–A05,
B01–B04 and C01–C04 satisfy local P3 acceptance; P3.C/P3.9 are Complete.

This accepts the implementation and tested support matrix. The separately
authorized [live upgrade](../deploy/p3-live-upgrade.md) still owns populated
backup/migration rehearsal, installed unit/agent and live end-to-end acceptance.
No live P3 migration, service restart, installed VM change, commit, publication
or GitHub execution occurred during re-review.

## Live deployment acceptance

Executed and accepted 2026-09-30 after the owner authorized “deploy p3” on the
Sol XHigh deployment checkpoint. The [upgrade procedure](../deploy/p3-live-upgrade.md)
was applied to the existing main checkout and installed disposable Debian 13/amd64
VM agent. Runtime/config/tooling matches all 249 accepted fingerprints. Release
source tree `ac3224cac162cb3f78eb4ad8f5f725af39c325f2` differs from phase-tested tree
`bb499726f850d94583d48242fecd1c2a7f45ae21` only in documentation. The exact verified
production agent has SHA-256
`9ed9451ea5059e9424b90bdb30c4869aa108b3306bdc3ad32d922036fccd516b`.

| Release obligation | Executed evidence |
| --- | --- |
| Populated recovery readiness | Restricted custom-format live dump restored in one transaction into a uniquely owned temporary database on the existing PostgreSQL 18 instance. All original rows/references and ledger 001–005 survived additive migration; three baseline revisions and initialization audits, ledger 001–007 and 66 foreign-key checks passed. Second migration changed nothing. Owned rehearsal database dropped. |
| Live web upgrade | Stopped the existing user service, captured a final readable dump, migrated, performed locked install/build and restarted from the same checkout. Original P1/P2 data preserved. Interruption measured 14.83 seconds; enabled/active service listens on 0.0.0.0:10007, public TLS/login returns 200 and unauthenticated inventory returns 401. |
| Installed agent | Consistent stopped-state recovery archive precedes in-place binary/unit installation. Host/agent/generation and configuration digests remain identical; heartbeat sequence continues. Agent enabled/active, with exact dedicated identity, NoNewPrivileges, control-group kill, SendSIGKILL, five-second stop and on-abnormal restart. Interruption measured 0.82 seconds. |
| Existing and new observations | Existing host contact remains current and fresh post-upgrade disk runs are complete/healthy. All three baseline snapshots and typed observations arrive with completed process cleanup; no disk or baseline recovery latch remains. |
| Revision and history | UI changes APT simulation mode to include new dependencies at revision 4; the same installed binary delivers its result. UI restores original values at revision 5. Independent reads confirm restored desired/effective/delivered values and current result, while revisions 1/3/4/5 retain their own historical recipe meaning. |
| Rendered operator flow | Public HTTPS login → Fleet/defaults → existing host observations/history/settings verified at 1440×1000 and 390×844. Keyboard expands history; one main/heading, readable cards and no horizontal overflow or framework overlay. Screenshots inspected and retained privately. No page errors or application console errors; the browser's automatic undeclared favicon request returns 404, an existing cosmetic omission. |
| Final data/recovery readback | Ledger 001–007, 66 reference checks, three baseline definitions, six typed runs and empty recovery latches confirmed. Restricted web/source/config/database and VM binary/unit/config/state archives retained outside both repositories for immediate recovery and owner-reported PBS coverage. |

The installed VM reports cached zero package changes with unverified repository
freshness/local-state consistency (unknown), a present reboot marker (warning with
incomplete coverage), and unavailable completed fstrim history (unknown). No APT
refresh, package upgrade, trim or reboot was performed. No CT/additional-distribution
acceptance, destructive live database restore, remote publication or P4 work is
implied. Operational browser-harness corrections were recorded privately; accepted
product source did not change and the unchanged full phase/security gate was not
repeated for this release.
