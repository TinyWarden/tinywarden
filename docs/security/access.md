# P1 access and credential lifecycle

Status: implementation contract, selected 2026-09-28 for P1.1. P1.B implements
local access and new-host enrollment; P1.D replacement and revocation are complete.
[Protocol](../architecture/agent-protocol.md) owns wire
formats; [data](../architecture/data.md) owns storage and transaction ordering.

## Actors and authority

One installation has one local administrator and one fleet. This scope was
confirmed for P1. There is no registration, invitation, tenant switching, email
recovery, OIDC or role editor in this phase. The administrator can read inventory,
issue/revoke enrollment tokens, request credential replacement and revoke agents.
Agent credentials authorize only that agent's heartbeat. They grant no operator,
other-host, recipe-editing or host-execution authority.

P2's selected [check contract](../architecture/check-definitions.md) additionally
authorizes the same administrator to edit the global disk default and host policies.
It extends current agent credentials to that agent's assignment fetch and scoped
disk-result submission, with the same generation/revocation guard. No caller host
ID grants access. P2 adds typed revision audit actions atomically with mutations;
P2's extensions are implemented. P3's selected
[baseline contract](../architecture/baseline-observations.md) permits this same
administrator to edit only supported baseline recipe options and host policies.
Agent credentials fetch and report their own assignments; they cannot edit
recipes or expand the [local execution policy](../architecture/recipe-execution.md).
P3 endpoints, audit extensions and execution await their implementation batches.

Every protected read and root mutation validates current authority on the server.
Routes and page loaders use the same application boundary; middleware or hidden UI
alone is insufficient. Cookie authentication is accepted only by operator endpoints;
Bearer agent/enrollment credentials only by their designated endpoints. Never select
an authentication mode from whichever supplied credential happens to succeed.

## Local administrator

An explicit local `operator-init` command creates the fixed login `admin` only if
no administrator exists. A database uniqueness constraint makes concurrent init
attempts yield exactly one account. It reads the password twice from a hidden TTY
prompt, never from arguments, environment variables, logs or a web setup endpoint.
Automated tests call the internal use case with synthetic input. No default password.
Uninitialized instances deny login and fleet access with a catalog-backed setup
message; they expose no account-creation capability over HTTP.
Login without an initialized operator returns 503 `setup_required`; unauthenticated
fleet reads still return 401. Missing schema/database readiness returns the generic
503 availability error, not an invitation to bootstrap through HTTP.

The password normally accepts 15–128 Unicode scalar values and at most 512 UTF-8 bytes;
the owner's temporary development setup uses `TW_ALLOW_SHORT_OPERATOR_PASSWORD=1`
to lower the minimum to five. All other values retain the default minimum of 15.
The exception applies to setup, reset and login; rotate to a compliant password
before removing the flag for production. No password is hardcoded or supplied by default.
reject invalid Unicode, preserve whitespace and case, and do not silently trim,
normalize or truncate. No arbitrary composition or periodic reset rules. Use Node's
asynchronous `scrypt`: N=131072, r=8, p=1, random 16-byte salt, 64-byte output,
maxmem=192 MiB. Store algorithm/version, parameters, salt and hash. Permit only
recognized parameter sets when verifying; compare equal-length hashes in constant
time. A damaged record fails closed. At most one password hash runs per process;
there is no unbounded queue. Verify its memory/latency budget in P1.B.

This chooses a stable built-in password KDF without a new native package. Its cost
matches the documented scrypt alternative in
[OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
[Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
defines the asynchronous API and memory limit. Those references do not define this
project's login/session policy.

Login input bounds are 1–64 ASCII characters for login and the password bounds above;
malformed input returns 400. Reserve one of five login attempts per server-clock minute in a persistent singleton
counter before hashing; excess or an occupied hash slot returns 429 with Retry-After.
Counter reservation commits separately and also counts successful attempts. A clock
moving backwards never resets the window early. The public proxy adds request limits
before the application; arbitrary forwarded IP headers are not trusted. Wrong login
name/password gives the same 401 error. Unknown names use the same bounded dummy
hash path. Database failure gives 503 and never bypasses the throttle or authority.

Explicit local `operator-reset-password` is the P1 recovery route: hidden TTY input,
new salt/hash, increment account auth_version, invalidate all sessions and append
audit in one transaction. Hash outside the transaction, then lock and recheck account
version before changing it. Login also rechecks the version after hashing so a racing
reset cannot mint an old-authority session. No automatic account reset at startup.

## Sessions and browser requests

Generate a new 256-bit random secret and UUIDv4 session identifier after successful
login. Persist only its domain-separated digest, account/auth_version, issued_at,
last_seen_at and absolute expiry. Session format is `tw_s_<uuid>.<secret>`; secret is
unpadded canonical base64url of exactly 32 random bytes. Cookie name:
`__Host-tinywarden_session`; Secure, HttpOnly, SameSite=Strict, Path=/, no Domain,
Max-Age=28800. Do not expose the cookie value in JSON or client storage.

Absolute lifetime is 8 hours; idle limit is 30 minutes. At equality the session is
expired. Reject a clock before issued_at or last_seen_at. Recheck expiry/version
under the account/session locks for mutations. Authenticated use updates last_seen_at;
expired sessions cannot be revived by a late request. Support at most five sessions;
login under the account lock removes expired sessions and evicts the oldest if needed.
Logout deletes the authenticated session and clears the cookie; repeated logout with
an absent/invalid session clears the cookie and returns 204 without another audit.

For a root with later domain locks, defer activity renewal and recheck the original
idle/absolute limits at its effective time after those locks. Use that same time
for activity, mutation and audit, including repeated/no-op requests. Keep the
existing operator/session-first lock order; a later check must not hide expiry by
first refreshing last_seen_at.

All operator POST requests, including login/logout, require application/json,
an Origin exactly equal to configured PUBLIC_ORIGIN and `X-TinyWarden-Request: 1`.
Reject missing/null/mismatched Origin, simple form content types, absent header and
cross-site Fetch Metadata. No cross-origin CORS permissions. GET has no product
mutation or credential-issuance side effect. Server-rendered reads validate the session
directly; external origin is never reconstructed from an untrusted Host/forwarded header.
SameSite is an additional protection. This API/custom-header approach follows
[OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
Cookie and lifetime choices follow
[OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Authenticated HTML/JSON and all credential responses use Cache-Control: no-store.
Fleet data is never statically generated or stored in shared Next/CDN caches. Session
loss clears client fleet data and returns to login. A read failure shows unavailable;
it must not turn previously displayed data into current data.

## Enrollment and rotation

An operator creates a 15-minute, one-use enrollment token, with an operator-selected
host label. Token format is `tw_e_<uuid>.<32-byte base64url secret>`. Only its digest
is stored; show the secret once, with no URL/query-string transport or re-display.
Issuance request_id deduplicates operator retries. If the issuance response is lost,
the retry identifies the existing token but cannot recover its secret: revoke that
token and explicitly issue another. Do not silently issue several valid tokens.

The agent generates its own 256-bit credential secret and credential UUID, persists
the pending enrollment request durably, then submits it with the enrollment token.
The control plane grants the credential authority and stores only its digest.
This avoids a recoverable server-side secret while allowing response-loss recovery.
An authenticated replay with the same enrollment request, digest and active bound
credential returns the same host/agent identity, without creating records or audit.
Replay expires 24 hours after consumption; revocation blocks it immediately. Neither
replay nor enrollment counts as a heartbeat. Exact cases are in the protocol contract.

Credential replacement requires a new operator-issued token bound to an existing
active agent and its current generation. The agent durably saves a new pending secret
before redeeming it. One transaction consumes the replacement token, revokes the old
credential, advances the generation, activates the new one, clears last contact and
records audit. Host and agent IDs and cadence snapshots stay unchanged. Old/new keys
never overlap after commit. A racing token for the previous generation cannot apply.
Restart or response loss retries the saved request; never discard pending secrets
or generate a different secret on an ambiguous outcome.

Agent revocation is terminal in P1. Under the same agent lock, revoke all active
credentials, set revoked_at and record one audit event. Token redemption and heartbeat
recheck that state. A request serialized before revocation may commit; one serialized
afterwards cannot. The host remains visible as revoked. Rejoining after revocation
uses a new-host enrollment; never infer or merge identity from a hostname, IP or OS ID.
There is no automatic credential expiry in P1; operator rotation/revocation is explicit.

## Secret handling, audit and retention

For random credentials use SHA-256 over UTF-8 `tinywarden:<kind>:v1`, a NUL byte,
then the full credential. Kind is `session`, `enrollment` or `agent`. Salts/work factors
are needed for passwords; these independently random 256-bit secrets use a fast digest.
Validate type/prefix/UUID/encoding/length before lookup and compare digests safely.
Never send a stored digest to any client or include it in diagnostics.

Agent secrets live in a private directory (0700) and state file (0600) owned by the
service account; reject symlinks/wrong owner/broad modes. Write a new file, fsync,
rename atomically and fsync the directory before sending new authority. One process
holds the state-directory lock. Never copy enrolled state into another VM image.
Use TTY input for enrollment tokens. No secret argument, pasteable command containing
a secret, shell history, URL, log, browser storage or diagnostic dump.

Audit successful init/reset/login/logout, token issue/revoke, enroll/replace/revoke
with action, UTC time, actor ID/kind, target IDs, correlation ID and allowlisted state
transitions. Audit failure rolls back the associated state change. No raw bodies,
passwords, secrets, digests, hostname, IP, user agent or free-form reason in audit/logs.
Failed authentication is a bounded counter/safe diagnostic, not an unbounded audit
stream. Heartbeats update a current snapshot; they do not generate per-tick audit.

Action identifiers are `operator.initialized`, `operator.password_reset`,
`operator.login`, `operator.logout`, `enrollment.issued`, `enrollment.revoked`,
`agent.enrolled`, `agent.credential_replaced` and `agent.revoked`. Local init/reset
uses actor_kind=system; browser operations use operator; redemption uses the bound
agent with the token ID linking back to its issuing operator. Change fields are
limited to from_generation/to_generation for replacement and revoked=true for
revocation; other actions need only their typed actor/target/correlation metadata.

The [audit field contract](../architecture/data.md#audit-actor-and-target-representation)
keeps actor IDs separate from targets. Operator agent revocation records the
administrator in operator_id, leaves agent_id NULL and records the affected agent
in target_agent_id with its host_id. Enrollment and replacement record the bound
agent in both agent_id and target_agent_id, with host_id/token_id linking the action.
Token issue/revoke targets token_id; its retained row provides any replacement binding.
The audit helper enforces the action-specific field allowlist before inserting in
the root transaction; SQL retains its actor-kind and foreign-key checks. Historical
rows follow the data contract's limited self-action interpretation without rewriting
history. P1.D implements these fields and local runtime tests pass; final review
remains pending.

Keep host, token, credential and audit history in P1; no fleet hard-delete route or
automatic purge. Remove invalid/expired session rows during bounded session maintenance.
P4 [data lifecycle](../architecture/data-lifecycle.md) defines observation deletion,
retained retry/audit/authority evidence and backup treatment; implemented locally; live activation is pending.
No external telemetry, notifications or diagnostic exporter is introduced by P1.

The [database ownership contract](../architecture/data.md#postgresql-ownership-and-test-targets)
uses one PostgreSQL login for migrations and serving requests. Application roots
append audit events, but that login owns the tables and can alter or remove their
contents. Audit atomicity is enforced by transactions; owner-resistant or tamper-proof
audit is not provided by this deployment model.
