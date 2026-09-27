# TinyWarden

Self-hosted health and maintenance for Linux servers and VMs, wherever they run.

**Status: scaffold.** The web application displays an informational page. The Go
executable supports version/help output. Enrollment, monitoring, authentication,
database access and remote maintenance are not implemented. No sample fleet is
presented as real operational data.

## Start locally

Requires Node 24, npm 11 and Go 1.27.1. No database is needed for the scaffold.

```sh
npm ci --prefix apps/web --no-audit --no-fund
npm --prefix apps/web run dev -- --port 3000
```

Open `http://127.0.0.1:3000`. For a remote host, use an SSH tunnel. Development and
production commands bind to loopback by default. Use an available port and stop
only the process you started. Do not expose this scaffold to fleet traffic.

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
