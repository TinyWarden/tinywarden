# Configuration

Keep core settings in ignored, restricted `.env.production.local` at the serving
checkout. Never place credentials in Git or print environments in diagnostics.
[.env.example](../../.env.example) contains non-secret names/examples; application
validation lives in [server/config.ts](../../server/config.ts).

| Setting | Meaning and bounds |
| --- | --- |
| `PUBLIC_ORIGIN` | Required exact HTTPS origin, without userinfo/path/query/fragment. Used for authorization, links and callbacks. |
| `DATABASE_URL` | Required PostgreSQL connection as `tinywarden` to the named owned database, loopback or reserved Unix socket; no alternate runtime role. |
| `PORT` | Reserved app listener port for the native unit. |
| `TW_BIND_HOST` | Loopback by default; select a network binding only when the proxy requires it. |
| `HEARTBEAT_INTERVAL_SECONDS` | New-enrollment default, 60; integer 10–300. |
| `HEARTBEAT_STALE_AFTER_SECONDS` | New-enrollment default, 180; at least three intervals and at most 3600. Existing agent snapshots do not change automatically. |
| `TW_SKILL_RUNTIME_ASSETS` | Verified trusted runtime directory; native releases can pin it with the accepted job artifact. |
| `TW_SKILL_PACKAGE_STORE` | Private content store; default `var/skills` under the checkout. Include it in recovery coverage. |
| `TW_OIDC_CLIENT_SECRET` | Confidential provider secret, server environment only; configure provider metadata in Sign-in settings. |
| `TW_ALLOW_SHORT_OPERATOR_PASSWORD` | Development exception only: `1` lowers the normal 15-character minimum to five. Default off; apply normal policy for deployment. |
| `TW_TEST_DATABASE_URL` | Test runner only; exact reserved `tinywarden_test_p1b` target. Never substitute serving credentials or feature flags. |
| `TW_NPM_CLI` | Optional verified local pinned npm CLI path used by native release tooling. |

The database login owns project databases/schema/tables. Provision LOGIN/CREATEDB
where owned database/rehearsal creation is needed; superuser, role creation,
replication and bypass-RLS privileges are unnecessary. Explicit target/owner checks
reduce accidental operations but do not remove the owner's database privileges.
Use PostgreSQL 18 dump/restore tools for supported recovery.

## Job target file

Native job units also require a mode-0600 ignored `.env.jobs.local` in the checkout.
Set `TW_MAINTENANCE_DATABASE` to the exact owned database name, for example
`TW_MAINTENANCE_DATABASE=tinywarden`. This is the expected-target guard, not a second
connection URL; the units load the connection from the main environment file.
Do not enable timers before creating this file and pinning compatible job artifacts.
See [job setup](jobs-and-email.md#prepare-job-execution).

## Mail files

Optional `.env.notifications.local` and `.env.account-emails.local` contain mail
settings only. They must not override database, origin or listener configuration.
Restart affected services after environment changes. Account mail reuses SMTP
credentials but has its own transport/from override.

| Setting | Meaning |
| --- | --- |
| `NOTIFICATIONS_TRANSPORT` | disabled, capture or smtp; monitoring default disabled |
| `NOTIFICATIONS_FROM`, `NOTIFICATIONS_TO` | Monitoring sender and one configured recipient |
| `NOTIFICATIONS_INCLUDE_WARNINGS`, `NOTIFICATIONS_RECOVERIES` | Monitoring event choices, default true |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | Validated SMTP connection; verified implicit TLS 465 or mandatory verified STARTTLS 587 |
| `ACCOUNT_EMAILS_TRANSPORT` | smtp or disabled; defaults to smtp when monitoring transport is smtp, otherwise disabled |
| `ACCOUNT_EMAILS_FROM` | Optional account-mail sender override; otherwise notification sender |

Account recipients come from saved account mailboxes, never `NOTIFICATIONS_TO`.
Monitoring route changes require the guarded configure command. See
[jobs and email](jobs-and-email.md).

## Proxy and runtime boundary

Terminate public TLS at a trusted reverse proxy, reject unexpected hosts and
sanitize forwarded headers. Suppress request bodies, cookies, authorization and
SQL parameter values from logs. Set appropriate edge body/time/rate limits; app
origin/session/authorization/request bounds still apply behind the proxy.
Missing runtime isolation makes package execution unavailable; never introduce an
unsandboxed fallback. Private content and state must not be served as static files.
