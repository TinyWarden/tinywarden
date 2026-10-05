# TinyWarden

Self-hosted health monitoring for Linux servers and VMs. TinyWarden shows what
needs attention, keeps observed change history and can send email alerts.
Skills observe the host; they do not install updates, reboot it or perform repairs.

## Features

- Local administrator login and secure agent enrollment.
- Server contact status and a dashboard grouped by severity.
- Four official skills: Disk usage, Package updates, Reboot required and Filesystem trim.
- ZIP skill installation with access review and automatic delivery to compatible agents.
- Global skill switches and defaults, with individual settings overridden per server.
- Change history, email alerts/recoveries and 90-day reading retention.

The agent is currently verified on Debian 13, amd64. English is the enabled
language; display text lives in message catalogs. See the [user guide](docs/usage.md)
for check meanings and limitations.

## Getting started

Requires Node 24, npm 11 and PostgreSQL 18. The Python skill platform additionally
requires Python 3.13, bubblewrap, libseccomp2 and delegated native cgroup v2 limits.
See the [runtime requirements](docs/architecture/skill-runtime.md).
The application package lives at the
repository root. Configure a reserved database and HTTPS origin using
[.env.example](.env.example) and the [configuration guide](docs/deploy/configuration.md).
Run migrations and initialize the local administrator before signing in; follow
[native installation](docs/deploy/native-release.md#first-installation).

For development, after configuring the environment and database:

```sh
npm ci --no-audit --no-fund
npm run dev -- --port 3000
```

The development listener is `127.0.0.1:3000`. An HTTPS proxy must match the configured
origin. For a remote host, use an SSH tunnel to reach a local proxy/listener.
Do not install dependencies or run a normal production build in a serving checkout;
use the [release procedure](docs/deploy/native-release.md).

## Source and documentation

This repository owns the web app, APIs, database and background jobs. The independent
[tinywarden-agent](https://github.com/TinyWarden/tinywarden-agent) repository owns the
host agent. Neither build requires the other repository's checkout.

- [Documentation](docs/README.md)
- [Architecture](docs/architecture/overview.md) and [file map](docs/architecture/codebase-map.md)
- [Native deployment](docs/deploy/native.md) and [operations](docs/operations/runbook.md)
- [Contributing](CONTRIBUTING.md) and [verification](docs/development/verification.md)
- [Create a standalone skill](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/authoring.md)

Licensed under [Apache-2.0](LICENSE). Preserve the
[third-party notices](THIRD_PARTY_NOTICES.md) when redistributing.
