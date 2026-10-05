# Configuration contract

The root .env.example documents non-secret examples. Configure your own HTTPS
origin, database and port in ignored local environment files. Native units are
optional templates rendered for your checkout; see [native deployment](native.md).

| Value | Consumer / required or default | Validation and safe example | Failure / operational impact |
| --- | --- | --- | --- |
| PUBLIC_ORIGIN | Server operator-origin guard; required at product runtime | Absolute HTTPS origin, no credentials/query/fragment/path except `/`; canonicalize trailing slash away. Never derive it from request headers. | Invalid/missing blocks product readiness; mismatch rejects operator mutations. Changing it logs users out through origin/cookie changes and needs deployment coordination. |
| DATABASE_URL | Server adapter, local operator commands and explicit migration command; required | PostgreSQL connection as `tinywarden` to the explicitly reserved owned database. Loopback TCP or a reserved Unix socket only. Example `postgresql://tinywarden@localhost/tinywarden`; any password is supplied privately. Migrations additionally require an exact expected database name and connected ownership check. | Invalid/unreachable returns unavailable; no alternate database or inferred role. A migration target/owner mismatch stops before DDL. |
| TW_ALLOW_SHORT_OPERATOR_PASSWORD | Password validation in setup/reset/login; default off | Only `1` enables the optional development minimum of five characters; all other values keep 15. No default credential is created. | Configure both the operator command and serving process consistently. Rotate to a password meeting the default policy before removing this exception for production. |
| TW_TEST_DATABASE_URL | PostgreSQL integration harness only; explicitly supplied | Same `tinywarden` login and existing instance, database exactly `tinywarden_test_p1b`. Verify connected database, current/session role and owner before resetting fixtures. | Refuse unsafe targets. Never fall back to DATABASE_URL or a process's default PostgreSQL database. Missing test configuration is reported as not run and cannot satisfy batch acceptance. |
| HEARTBEAT_INTERVAL_SECONDS | New enrollment snapshot; default 60 | Canonical decimal integer 10..300 | Invalid blocks readiness; changing the default affects new agents only. |
| HEARTBEAT_STALE_AFTER_SECONDS | New enrollment snapshot; default 180 | Integer ≥3×interval and ≤3600 | Invalid pair blocks readiness; existing snapshots remain unchanged. |
| TW_BIND_HOST | Optional native service listener | `127.0.0.1` by default; operator-selected network binding in private config | Restart the service after changing it and align the HTTPS proxy upstream. |
| PORT | Native Next process; required reserved production port | Operator-selected port; template listener defaults to `127.0.0.1` | Conflict blocks activation. See native deployment for service/path ownership. |
| control_plane_origin | Agent configuration; required | Same HTTPS-origin rules; exact configured destination only | Invalid stops before reading/transmitting credential; redirects/TLS failures never bypass validation. |
| state_dir | Agent configuration; required absolute reserved path | Example `/var/lib/tinywarden-agent`; 0700 owned directory, private files, exclusive process lock | Wrong owner/mode, symlink or unavailable durable storage stops enrollment/polling before network mutation. |

Node runtime remains production and Next telemetry remains disabled as described in
[native deployment](native.md). Product server configuration is parsed once in a
server-only module at the request boundary, with field-name-only diagnostics. Build/static
analysis must not connect to a database or require production secrets. Use fixed
explicit synthetic configuration in tests; never fall back to the host's live env.

## Single-user database setup

The existing `tinywarden` login creates and owns the project databases and their
objects. LOGIN and CREATEDB are sufficient for that workflow; ownership supplies
schema/table management. PostgreSQL superuser, role creation, replication and bypass-RLS
attributes are unnecessary. See the [ownership contract](../architecture/data.md#postgresql-ownership-and-test-targets)
for the consequences of sharing database ownership with the application.

For an existing role, a PostgreSQL administrator can set the intended attributes:

```sql
ALTER ROLE tinywarden WITH
  LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
```

No password change is part of this command. If the existing role already has these
attributes, no administrator command or additional GRANT is needed. Database creation
and migrations run as `tinywarden`; the serving process needs no sudo or PostgreSQL
administrator connection. MIGRATION_DATABASE_URL and separate migration/runtime
role names are retired from this contract. Explicit migration invocation and target
validation provide the operational boundary; they do not remove owner privileges.
Role attributes and ownership are defined by PostgreSQL's
[role](https://www.postgresql.org/docs/18/sql-createrole.html) and
[database creation](https://www.postgresql.org/docs/18/sql-createdatabase.html) rules.

## Runtime exposure and limits

Python package execution requires Python 3.13, bubblewrap, libseccomp2 and cgroup v2
CPU/memory/PID delegation. The native app template delegates these controllers and
keeps the service process in its supervisor subgroup. Configure
`TW_SKILL_RUNTIME_ASSETS` to the verified immutable runtime directory in the accepted
job artifact, and optionally `TW_SKILL_PACKAGE_STORE` to a private, ignored content
store (default `var/skills` beneath the checkout). Runtime files are trusted platform
assets; packages cannot edit them. Missing isolation is reported as unavailable.

The reverse proxy terminates public TLS and forwards to the selected app listener.
Listener exposure follows TW_BIND_HOST and the configured port. The HTTPS proxy
must be able to reach that listener; choose its binding in private configuration.
Proxy-only controls therefore apply only to traffic through that proxy; application
authorization, origin checks and request limits remain enforced for direct traffic.
It must overwrite forwarded headers, reject unexpected hosts, suppress API request
bodies/authorization/cookies in logs, and enforce body/time/rate limits before Node.
Initial edge API ceiling: 20 requests/second per source IP with burst 40; login
additionally five/minute per source IP. Source IP comes from the trusted network
edge, not a caller-supplied header. Review NAT/fleet capacity before increasing it.
App login's persistent limit remains authoritative even without proxy attribution.

Application limit: at most 64 active API requests, including pool waiters; reject
excess with 503 and Retry-After: 1 rather than queueing indefinitely. The server's
bounded request caps, transaction timeouts and credential validation remain enforced
behind the proxy. Secret-bearing responses use no-store and no referrer leakage;
disable raw request/response/SQL-parameter logging in the proxy and database adapter.

## Agent baseline state

Baseline caches, sequences, queues and pause files reside under the existing agent
`state_dir` with private ownership/lock requirements. Capability depends on the
verified non-root Debian 13/amd64 target; unsupported hosts remain explicit.
Interval/budget and APT simulation mode are settings, not arbitrary command or
environment input. Agent test-only synthetic identities do not change production
TLS trust. See [baseline protocol](../architecture/baseline-protocol.md).

## Email configuration

[Notifications](../architecture/notifications.md#routing-content-and-adapter) owns
validation and safe pause behavior. Transport defaults to `disabled`; warning and
recovery flags default On. Capture requires synthetic sender/recipient and the
configured HTTPS origin. SMTP requires the endpoint/account/password and verified
implicit TLS on 465 or mandatory verified STARTTLS on 587. Store real settings only
in ignored mode-0600 local files. Guarded `configure` adopts changes; password
rotation preserves route identity. No automatic recipient/configuration adoption.
See [CLI commands](../architecture/notifications.md#local-commands). Apply all current
migrations and configure compatible fixed jobs before enabling timers. After
restore, keep sending disabled and rotate the restored epoch.
