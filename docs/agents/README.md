# Application guide for LLM assistants

Use [AGENTS.md](../../AGENTS.md) for repository instructions and the
[file map](codebase-map.md) for exact path ownership. Human documentation starts
at [the documentation index](../README.md).

| Change | Inspect first | Focused checks |
| --- | --- | --- |
| UI | `app/`, owning `components/`, message catalogue, shared Playbook | Lint, types, relevant tests and rendered desktop/mobile reference comparison |
| Skill contract or evaluation | `lib/skills/`, `server/skills/`, affected tests and pinned SDK | Contract fixtures, admission/evaluation tests and affected transport consumers |
| Data or access | `server/db/`, owning domain and permission checks | Isolated database tests for permissions, transactions and retention |
| Host transport | Agent protocol handlers, fixtures and agent-owned definitions | Fixture parity, replay/compatibility and affected agent tests |
| Documentation or tooling | Owning commands, source guards and map roles | Links, examples, source/map checks and changed tool tests |

## Load context by task

- Read [architecture](../reference/architecture.md) for ownership/trust boundaries.
- For Fleet lifecycle/organization, pause, retention or purge read
  [Fleet contracts](../reference/fleet-management.md), including shared action eligibility and explicit bulk scope, epochs, common
  lock order, irreversible expiration and every owned data family.
- For data/authorization read [access control](../reference/access-control.md) and
  [lifecycle](../reference/data-lifecycle.md). Check denied reads, revocation and
  exact/changed replay, not only successful Admin paths.
- For assignments/settings/results read [monitoring](../reference/monitoring.md)
  and [protocol](../reference/agent-protocol.md). Preserve original context and
  independent contact/freshness/health evidence.
  Evaluation uses the shared [SDK clock contract](../reference/skills/sdk.md#clock-contract);
  keep transport admission/deadlines separate and add no package-specific buffers.
- For skill extensions read [Build skills](../build-skills/README.md) and its
  [references](../README.md#technical-reference). Inspect released consumers before
  expanding a wire/SDK contract; do not branch on package IDs.
- For UI read the [Playbook check](../contributing/playbook.md#required-ui-reference-check),
  owning gallery example and [copy rules](../contributing/localization.md).
- For managed agent updates read [update contracts](../reference/agent-updates.md);
  preserve exact signed targets, root request journals and running-process confirmation.
- For host maintenance read [maintenance contracts](../reference/maintenance-actions.md).
  Keep typed action authority, exact plan approval, uncertain transaction fencing
  and generic verification separate from monitoring skill execution.
- For releases read [responsibilities](../contributing/releases.md) and the
  [native procedure](../operating/native-releases.md); verify actual assets.
- For dependency changes read the [audit policy](../contributing/verification.md#dependency-audit-policy).
  Keep locked installs and full audits; unrelated lock edits do not renew the
  scoped exception. Changing its affected graph, exposure or expiry needs approval.

Use commands from [verification](../contributing/verification.md). Keep changes scoped to
the task. Do not weaken source, secret, sandbox or permission checks to make a gate
pass. Runtime assets under `runtime/skills/` are pinned, not hand-edited SDK copies.
The host-agent repository owns SDK changes; integrations must update provenance
and hashes intentionally.

The generated map describes files; the public technical reference defines behavior.
When prose and code disagree, identify the discrepancy before changing either.
Follow the [documentation policy](../contributing/documentation.md): update affected
human guidance and reference together. Instructions must work without private notes.

Maintenance domain implementations belong to skill packages. The retired app formats
are under `server/maintenance/legacy` and `lib/maintenance/legacy*` for stored history,
late already-delivered results and signed v1 recovery only. New preparation requires
a full action binding; never route it through the historical validators. The generic
agent/runtime dependency boundary and cache/workspace cleanup tests enforce this.
