# Security and privacy boundaries

Protected material will include agent credentials, enrollment tokens, operator
sessions, host identifiers/metadata, observations and approved command definitions.
P1 test resources contain synthetic versions of these records; the live service
was subsequently activated under owner authority. No optional telemetry or external
diagnostic exporter is installed.

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
The selected P3 [execution policy](../architecture/recipe-execution.md) fixes
allowed profiles and arguments on the agent, requires trusted local tools and
bounds process groups and output. Raw command output stays in process memory;
only normalized observation fields may be uploaded. The control plane cannot
expand local command authority by editing a recipe. Future maintenance requires
separate scope, authority, expiry, approval and audit.

P2 uses a fixed read-only capacity collector, with no arbitrary recipe text.
The selected [observation contract](../architecture/disk-observations.md#agent-service-view)
records the required host mount view and explicit P2.B service sandbox tradeoff.
The dedicated account remains unprivileged; missing coverage cannot become healthy.
The [definition contract](../architecture/check-definitions.md) owns authorized
policy edits and immutable generation-scoped deliveries. P2 is implemented and
accepted; P3's command execution is a separate implemented capability awaiting final review and live activation.

Bound requests, results, retries, buffering and retention. Logs use allowlisted safe
metadata; never record credentials, raw payloads, process environments or customer
content. Provider credentials remain behind server-side adapters. Provider metadata
cannot grant host-command authority. Secret/dependency scans run at phase closeout;
security-related implementation and focused authorization tests happen with each slice.

Use a private reporting channel for suspected exploitable issues until a repository
security advisory workflow is established; do not disclose secrets in public issues.

P3.C authenticates before any known-assignment hint or scoped run lookup. Exact
compiled whole-recipe validation applies to server definitions and local execution;
a valid digest cannot authorize additional argv, shell, user, cwd or environment.
Strict bounded JSON rejects duplicate/unknown fields before map/struct decoding.
The worker sees captured non-secret identity/recipe inputs and returns only typed
evidence to the single state owner. Generation recovery latches, durable pause,
immutable sequence and exact uncertain uploads prevent automatic reauthorization
after restored or corrupt state. Final Astra execution review is mandatory before
P3 completion; phase-end dependency/secret checks do not substitute for that review.


P4.B's selected [notification contract](../architecture/notifications.md) adopts
one-recipient email alerts/recoveries. Shared health summaries retain separate
operator and guarded local-system roots. The system root grants no host execution
or browser bypass. Recipient/provider settings remain private; only a bounded
catalog message, host label/state/time and fixed-origin link may leave via SMTP.
Capture tests cannot use the real route. Uncertain attempts are visible and never
automatically resent. Implementation is accepted locally; live activation remains pending.
