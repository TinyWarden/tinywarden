# Security and privacy boundaries

Protected material will include agent credentials, enrollment tokens, operator
sessions, host identifiers/metadata, observations and approved command definitions.
No such data is collected by the scaffold. No optional telemetry or external
diagnostic exporter is installed.

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
