# Documentation

## Using TinyWarden

- [User guide](usage.md): pages, skill meanings, defaults and overrides.
- [Agent repository](https://github.com/TinyWarden/tinywarden-agent): supported hosts,
  installation, enrollment and agent operations.

## Installing and operating

- [Native deployment](deploy/native.md): service templates and release scope.
- [Installation and release tooling](deploy/native-release.md): setup, upgrades and jobs.
- [Configuration](deploy/configuration.md): variables, database and proxy boundaries.
- [Operations](operations/runbook.md): service checks, backups and recovery.
- [Access](security/access.md) and [security boundaries](security/boundaries.md).

## Contributing

- [Architecture](architecture/overview.md), [repository ownership](architecture/repositories.md)
  and [complete file map](architecture/codebase-map.md).
- [Toolchain](development/toolchain.md), [verification](development/verification.md)
  and [third-party material](development/third-party.md).
- [UI contract](ui/contract.md) and [localization](ui/localization.md).
- [Write a standalone skill](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/authoring.md)
  and [Python SDK v1 reference](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/sdk-v1.md).

## Technical contracts

- [Data and migrations](architecture/data.md), [retention/recovery](architecture/data-lifecycle.md).
- [Agent protocol](architecture/agent-protocol.md), [disk definitions](architecture/check-definitions.md)
  and [disk observations](architecture/disk-observations.md).
- [Baseline observation boundary](architecture/baseline-observations.md),
  [baseline protocol](architecture/baseline-protocol.md), [recipes](architecture/recipe-execution.md)
  and [normalizers](architecture/baseline-normalizers.md).
- [Skill enablement](architecture/skill-enablement.md) and
  [individual field overrides](architecture/field-overrides.md).
- Installable skills: [platform and ownership](architecture/skill-platform.md),
  [package format](architecture/skill-packages.md) and [runtime boundary](architecture/skill-runtime.md).
- [Fleet assessments](architecture/fleet-dashboard.md), [change history](architecture/change-history.md)
  and [email notifications](architecture/notifications.md).
