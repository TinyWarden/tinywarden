# Security and privacy boundaries

Protected material will include agent credentials, enrollment tokens, operator
sessions, host identifiers/metadata, observations and approved command definitions.
P1 test resources contain synthetic versions of these records; the live service
is not activated. No optional telemetry or external diagnostic exporter is installed.

The selected [P1 access contract](access.md) owns local login, session/CSRF rules,
credential issuance, response-loss recovery, rotation/revocation and audit. The
[agent protocol](../architecture/agent-protocol.md) owns its wire/state semantics.

The [database ownership contract](../architecture/data.md#postgresql-ownership-and-test-targets)
uses one non-superuser PostgreSQL login for application access and migrations. It owns
the project databases and retains DDL and audit-table modification authority. The
application's audit behavior is append-only; database-owner tamper-resistance and
privilege isolation between the live and test databases are not provided.

Enforce authorization at the server boundary for every record and mutation. One-time
tokens expire and are atomically consumed; credentials are host-scoped, hashed,
revocable and rotatable. Require TLS for non-local agent traffic. Operator access
must be defined before exposing fleet data or editable configuration.

Check definitions are privileged because even a health recipe can invoke commands.
The first runner uses an argument array, no shell, a fixed working directory,
unprivileged identity and bounded execution/output. No free-form script facility.
Future maintenance requires separate scope, authority, expiry, approval and audit.

Bound requests, results, retries, buffering and retention. Logs use allowlisted safe
metadata; never record credentials, raw payloads, process environments or customer
content. Provider credentials remain behind server-side adapters. Provider metadata
cannot grant host-command authority. Secret/dependency scans run at phase closeout;
security-related implementation and focused authorization tests happen with each slice.

Use a private reporting channel for suspected exploitable issues until a repository
security advisory workflow is established; do not disclose secrets in public issues.
