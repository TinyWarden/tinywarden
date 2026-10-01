# Documentation index

| Contract | Owner and purpose |
| --- | --- |
| [Product brief](product/brief.md) | Outcome, users, scope and acceptance. |
| [Architecture](architecture/overview.md) | Module boundaries, data direction and trust. |
| [Agent protocol v1](architecture/agent-protocol.md) | Enrollment/heartbeat wire contracts, retries and derived contact state. |
| [Data and migrations](architecture/data.md) | P1 schema, root use cases, transactions, query and migration tool choices. |
| [Check definitions](architecture/check-definitions.md) | P2 global defaults, host overrides, revisions, authorized edits and agent delivery. |
| [Disk observations](architecture/disk-observations.md) | P2 filesystem coverage, immutable run meaning, health and bounded collection. |
| [Recipe execution](architecture/recipe-execution.md) | P3 compiled command profiles, unprivileged execution and process/output bounds. |
| [Baseline observations](architecture/baseline-observations.md) | P3 package/reboot/fstrim evidence, revisions and delivery/result integration. |
| [Baseline normalizers](architecture/baseline-normalizers.md) | Exact P3.B typed evidence, supported formats/ranges, shared fixtures and server evaluation. |
| [Baseline integration v1](architecture/baseline-protocol.md) | Exact P3.C wire/digests, additive schema, scoped private state and connected health. |
| [Data lifecycle](architecture/data-lifecycle.md) | P4 retention, compact retry receipts, bounded cleanup and recovery contract; implemented locally, activation pending. |
| [Email notifications](architecture/notifications.md) | P4.B selected health-sharing, transition/outbox, SMTP uncertainty and capture acceptance; implemented locally, activation pending. |
| [Codebase map](architecture/codebase-map.md) | Exhaustive Git path inventory and authored file roles. |
| [Master plan](development/master-plan.md) | Sole phase, task, batch and progress record. |
| [Toolchain](development/toolchain.md) | Supported versions, commands and compatibility choices. |
| [Verification](development/verification.md) | Check matrix, cadence and evidence. |
| [P1 acceptance](development/p1-acceptance.md) | Contract review and runtime proof obligations by implementation batch. |
| [P2 acceptance](development/p2-acceptance.md) | P2.1 design traces and batch-owned implementation proofs. |
| [P3 acceptance](development/p3-acceptance.md) | Execution-policy traces and P3 runner/recipe/integration proof obligations. |
| [Third-party material](development/third-party.md) | Provenance and license notices. |
| [Native deployment](deploy/native.md) | Release shape, configuration and activation gates. |
| [P2 live upgrade plan](deploy/p2-live-upgrade.md) | Executed single-checkout migration/VM upgrade evidence and recovery sequence. |
| [P3 live upgrade](deploy/p3-live-upgrade.md) | Executed single-checkout additive migration, agent/unit upgrade, live acceptance and recovery sequence. |
| [P1 configuration](deploy/configuration.md) | Required origins/database settings, validation and resource limits. |
| [Operations](operations/runbook.md) | Service ownership, recovery and maintenance. |
| [Security](security/boundaries.md) | Protected information, authorization and external effects. |
| [P1 access](security/access.md) | Local administrator, sessions, agent credentials, revocation and audit. |
| [UI contract](ui/contract.md) | Shared primitives, accessibility and truthful states. |
| [Localization](ui/localization.md) | Catalog ownership and future translation rules. |

The master plan links to these contracts; it does not duplicate their detailed rules.
