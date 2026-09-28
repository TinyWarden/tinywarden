# P1 configuration contract

Selected 2026-09-28; P1.B access and enrollment are implemented locally. The single-user database
contract supersedes the initial separate-role proposal. The first public origin is
`https://neutralisp.tinywarden.com`, with NGINX upstream to `127.0.0.1:10007` as
configured by the owner. Live database and service activation remain deployment gates.

| Value | Consumer / required or default | Validation and safe example | Failure / operational impact |
| --- | --- | --- | --- |
| PUBLIC_ORIGIN | Server operator-origin guard; required at product runtime | Absolute HTTPS origin, no credentials/query/fragment/path except `/`; canonicalize trailing slash away. First instance: `https://neutralisp.tinywarden.com`. Never derive it from request headers. | Invalid/missing blocks product readiness; mismatch rejects operator mutations. Changing it logs users out through origin/cookie changes and needs deployment coordination. |
| DATABASE_URL | Server adapter, local operator commands and explicit migration command; required | PostgreSQL connection as `tinywarden` to the explicitly reserved owned database. Loopback TCP or a reserved Unix socket only. Example `postgresql://tinywarden@localhost/tinywarden`; any password is supplied privately. Migrations additionally require an exact expected database name and connected ownership check. | Invalid/unreachable returns unavailable; no alternate database or inferred role. A migration target/owner mismatch stops before DDL. |
| TW_TEST_DATABASE_URL | P1.B integration harness only; explicitly supplied | Same `tinywarden` login and existing instance, database exactly `tinywarden_test_p1b`. Verify connected database, current/session role and owner before resetting fixtures. | Refuse unsafe targets. Never fall back to DATABASE_URL or a process's default PostgreSQL database. Missing test configuration is reported as not run and cannot satisfy batch acceptance. |
| HEARTBEAT_INTERVAL_SECONDS | New enrollment snapshot; default 60 | Canonical decimal integer 10..300 | Invalid blocks readiness; changing the default affects new agents only. |
| HEARTBEAT_STALE_AFTER_SECONDS | New enrollment snapshot; default 180 | Integer ≥3×interval and ≤3600 | Invalid pair blocks readiness; existing snapshots remain unchanged. |
| PORT | Native Next process; required reserved production port | `10007` for the first instance; bind `127.0.0.1` only | Conflict blocks activation. See native deployment for service/path ownership. |
| control_plane_origin | Agent configuration; required | Same HTTPS-origin rules; first instance `https://neutralisp.tinywarden.com`; exact configured destination only | Invalid stops before reading/transmitting credential; redirects/TLS failures never bypass validation. |
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

The reverse proxy terminates public TLS and forwards only to the loopback service.
It must overwrite forwarded headers, reject unexpected hosts, suppress API request
bodies/authorization/cookies in logs, and enforce body/time/rate limits before Node.
Initial edge API ceiling: 20 requests/second per source IP with burst 40; login
additionally five/minute per source IP. Source IP comes from the trusted network
edge, not a caller-supplied header. Review NAT/fleet capacity before increasing it.
App login's persistent limit remains authoritative even without proxy attribution.

Application limit: at most 64 active API requests, including pool waiters; reject
excess with 503 and Retry-After: 1 rather than queueing indefinitely. The server's
16 KiB request cap, transaction timeouts and credential validation remain enforced
behind the proxy. Secret-bearing responses use no-store and no referrer leakage;
disable raw request/response/SQL-parameter logging in the proxy and database adapter.

Reserved deployment facts can be supplied during P1.D. They do not block writing
and testing the contracts against synthetic inputs in the reserved test database. No
public hostname, certificate, database, role or persistent service is created by
this document. Native installation must pass the P1 acceptance and recovery gates.
