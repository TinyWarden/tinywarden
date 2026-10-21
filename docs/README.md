# TinyWarden documentation

TinyWarden monitors Linux servers through an outbound host agent and installable
skills. The platform evaluates configured checks, retains observations and sampled
changes, and presents shared dashboards. Healthy means those checks pass within
their scope; it is not a guarantee about everything running on the machine.

## Get started

[Install TinyWarden and observe your first server](get-started/README.md). The
supported managed host is Debian 13/amd64. Follow the native installation and exact
dependency/runtime requirements in the linked guides.

## Use TinyWarden

- [Overview and roles](using/README.md)
- [Dashboard and customization](using/dashboard.md)
- [Fleet, groups, maintenance and removal](using/fleet.md)
- [Servers, readings and Services selection](using/servers.md)
- [Skills, installation, updates and defaults](using/skills.md)
- [History and charts](using/history.md)
- [Settings](using/settings.md)
- [Accounts, groups, sign-in and recovery](using/accounts.md)
- [Page and URL reference](reference/navigation.md)

The official skills are Disk space, Filesystem trim, Package updates, Reboot status
and Services. The [current skill guide](using/skills.md) explains their scope and
limitations. Services starts with no selected services; discovery never chooses
everything automatically.

## Operate an installation

- [Native installation](operating/install.md)
- [Configuration](operating/configuration.md)
- [Agent installation, policy and updates](operating/agents.md)
- [Local accounts and OIDC](operating/sign-in.md)
- [Background jobs and email](operating/jobs-and-email.md)
- [Native application releases](operating/native-releases.md)
- [Backups and recovery](operating/backups-and-recovery.md)
- [Troubleshooting](operating/troubleshooting.md)

## Build skills

Start with the [author journey](build-skills/README.md), then follow the
[quickstart](build-skills/quickstart.md) to bootstrap the pinned SDK and create,
validate, test and pack a working package. A compatible skill needs no app or
host-agent source change.

- [Testing and real collection](build-skills/testing.md)
- [Resource skills and independent target health](build-skills/resources.md)
- [Publish, install and update](build-skills/publishing.md)
- [Author troubleshooting](build-skills/troubleshooting.md)
- [Synthetic resource example](build-skills/examples/targets/README.md)

## Technical reference

| Platform | Skill contract |
| --- | --- |
| [Architecture and ownership](reference/architecture.md) | [Package files and identity](reference/skills/package-format.md) |
| [Agent protocol](reference/agent-protocol.md) | [SDK methods and lifecycle](reference/skills/sdk.md) |
| [Access control](reference/access-control.md) | [Host access and budgets](reference/skills/host-access.md) |
| [Monitoring and settings](reference/monitoring.md) | [Resources and selection epochs](reference/skills/resources.md) |
| [Fleet management](reference/fleet-management.md) | |
| [Data lifecycle](reference/data-lifecycle.md) | [Display and dashboard descriptors](reference/skills/display.md) |
| [History and notifications](reference/history-and-notifications.md) | [Notification Details](reference/skills/notifications.md) |
| [Navigation](reference/navigation.md) | [Metric history](reference/skills/metric-history.md) |
| | [Compatibility](reference/skills/compatibility.md) |

Older-agent support: [legacy compiled observations](reference/legacy-observations.md).

Machine-readable schemas: [repository catalogue](architecture/skill-repository.schema.json)
and [notification Details](architecture/skill-notification-details.schema.json).

## Contribute

Use the [contributor journey](contributing/README.md) for development, verification,
releases and documentation maintenance. UI changes use the
[shared Playbook](contributing/playbook.md). LLM assistants use each repository's
root `AGENTS.md` and `docs/agents/` task guide, which link these same references.

Other repositories: [host agent and SDK](https://github.com/TinyWarden/tinywarden-agent),
[official skills](https://github.com/TinyWarden/tinywarden-skills).
