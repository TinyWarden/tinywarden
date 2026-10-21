# Install the application

Use a dedicated native Linux service account, Node.js 24, npm 11.16.0,
PostgreSQL 18 and an HTTPS reverse proxy. Python skill execution additionally needs
Python 3.13, bubblewrap, libseccomp2 and delegated cgroup v2 CPU/memory/PID limits.
The native templates support a linger-enabled systemd user service.

## Prepare configuration and database

Choose one serving checkout and clone the application there. The package root is
the repository root. Provision the local PostgreSQL `tinywarden` login and an owned
database with an explicitly selected name. The application accepts loopback or a
reserved Unix socket, not an arbitrary remote database. See
[configuration](configuration.md) for validation and ownership requirements.

Create an ignored mode-0600 `.env.production.local` using
[.env.example](../../.env.example). Set your HTTPS `PUBLIC_ORIGIN`, private
`DATABASE_URL`, reserved `PORT` and listener binding. Configure the proxy to reach
that listener and overwrite untrusted forwarding headers. The service account
needs linger enabled by the host administrator if it must survive logout/reboot.

## Initialize and start

The example database name is `tinywarden`; replace it consistently with your owned
target. Run from the checkout as the application service account:

```sh
npm ci --include=dev --no-audit --no-fund
node --env-file=.env.production.local --import tsx server/db/migrate.ts tinywarden
node --env-file=.env.production.local --import tsx scripts/operator.ts init
npm run build
node scripts/install-native-services.mjs --backup /absolute/private-backups/first-install
systemctl --user daemon-reload
systemctl --user enable --now tinywarden.service
```

Select a new absolute backup path. Migration checks the target and ownership.
Operator initialization uses a hidden terminal prompt, creates the initial local
account named `admin` and refuses an already initialized installation. No default
password exists.
Unit installation renders independent copies; optional job timers remain opt-in.

Verify the configured listener, public HTTPS login and one authenticated Dashboard
read. A running process alone does not establish database/agent readiness. Sign in,
[add a host](agents.md) and enable reviewed skills. Configure optional
[jobs and mail](jobs-and-email.md) separately. Use [native releases](native-releases.md)
for subsequent app upgrades rather than treating first-install commands as recovery.
