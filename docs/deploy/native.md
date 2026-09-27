# Native deployment direction

TinyWarden targets a single Linux host with native Node 24 and PostgreSQL 18.
No container engine is required. The current repository is a scaffold, not a
deployable fleet service. No database provisioning or persistent service activation
has been performed.

`infra/systemd/tinywarden.service` is an administrator-reviewed system-unit template.
It runs as an unprivileged `tinywarden` identity against an immutable release under
`/srv/tinywarden/current`. This is a proposed release path, not the source checkout.
Resolve that path and its permissions before installing the unit. The template
resolves Node through `/usr/bin/env` with the unit's explicit system-only PATH;
verify the selected supported runtime and filesystem permissions on the target.

The private `/etc/tinywarden/web.env` must provide a reserved `PORT` and later the
validated application configuration. Never put secrets into the template. The
web server binds to loopback; a separately adopted TLS reverse proxy owns exposure.
`ProtectHome=true` intentionally requires the release outside a home checkout.
Only `.next` runtime cache is writable under the release; verify this against the
selected runtime before activation. A successful unit parse is not service readiness.

| Configuration | Consumer | Required/default | Failure/impact |
| --- | --- | --- | --- |
| `NEXT_TELEMETRY_DISABLED` | Next tooling | `1` in project commands | Tool telemetry stays disabled. |
| `PORT` | Next server | CLI default 3000 only for loopback smoke; reserve production value explicitly | Conflict prevents startup; never kill an unrelated listener. |
| `NODE_ENV` | Node/Next | `production` in system unit | Build/runtime behavior must match release. |
| Database credentials/origin | Future application boundary | Not consumed by scaffold | Define validation/examples with P1; do not reuse historical example credentials. |

Before first activation: reserve resources, verify database ownership and dedicated
role, settle authentication/TLS, validate configuration, build an exact verified
revision, establish backup/restore and a compatible rollback path. An administrator
installs/starts the unit only after explicit deployment authority.

After serving traffic, build in an isolated checkout on the same host and deploy
immutable release artifacts. Do not run builds, broad cache cleanup or destructive
tests in the live serving checkout. A future dev/prod split is a planned operations
change, not a prerequisite for scaffold work.
