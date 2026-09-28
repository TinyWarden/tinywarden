# TinyWarden

Self-hosted health and maintenance for Linux servers and VMs, wherever they run.

**Status: P1 local implementation, phase checks and final review complete.**
The control plane has local operator authentication, enrollment, credential
replacement/revocation, heartbeat storage and a guarded fleet view under local
tests. The Go agent enrolled and sent heartbeats from a disposable Debian 13
VM in P1.C; restart and pending-request recovery were verified. Contact state is displayed;
host health and remote maintenance are future work. No sample fleet is presented
as real operational data.

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
`https://neutralisp.tinywarden.com`; its NGINX upstream is loopback port `10007`.
Live service activation has its own release gate.

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
- [Contributing](CONTRIBUTING.md)

English is the first locale; user-facing copy belongs to message catalogs.
Proxmox support is optional and planned. Licensed under [Apache-2.0](LICENSE).
