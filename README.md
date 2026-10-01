# TinyWarden

Self-hosted health and maintenance for Linux servers and VMs, wherever they run.

**Status: P3 implemented, reviewed and deployed.**
The control plane provides local operator authentication, agent enrollment and
credential lifecycle, heartbeat and disk health, plus versioned package-update,
reboot-marker and fstrim observations with assignment settings and history.
Connected behavior was verified on a disposable Debian 13 VM. Observation limits
and unknown states are explicit; these checks perform no maintenance actions.
The live control plane and Debian 13 VM agent run P3 after the approved upgrade
on 2026-09-30; see the [master plan](docs/development/master-plan.md) and
[live acceptance evidence](docs/development/p3-acceptance.md#live-deployment-acceptance).

## Start locally

Requires Node 24, npm 11 and Go 1.27.1. The public information page needs no
database; product routes require an explicitly configured PostgreSQL 18 database.

```sh
npm ci --prefix apps/web --no-audit --no-fund
npm --prefix apps/web run dev -- --port 3000
```

Open `http://127.0.0.1:3000`. For a remote host, use an SSH tunnel. Development and
production commands bind to loopback by default. Use an available port and stop
only the process you started. Follow the [database and origin contract](docs/deploy/configuration.md)
before trying the APIs. The first reserved HTTPS origin is
`https://neutralisp.tinywarden.com`. The owner-approved live service listens on
`0.0.0.0:10007`; NGINX forwards HTTP to the server's public IP at that port.
Future live service changes retain their release gate.

```sh
./scripts/verify.sh --batch
./scripts/verify.sh --phase-end
```

Batch checks stay local. Phase closeout adds the production build, dependency and
secret checks. GitHub verification is dispatched explicitly at phase closeout.

## Project guide

- [Documentation index](docs/README.md)
- [Master plan](docs/development/master-plan.md)
- [Verification contract](docs/development/verification.md)
- [Architecture and codebase map](docs/architecture/overview.md)
- [Native deployment](docs/deploy/native.md)
- [Installation, release tooling and optional jobs](docs/deploy/native-release.md)
- [Contributing](CONTRIBUTING.md)

English is the first locale; user-facing copy belongs to message catalogs.
Proxmox support is optional and planned. Licensed under [Apache-2.0](LICENSE).
