# Access control and account security

For tasks, start with [accounts](../using/accounts.md) and
[operating sign-in](../operating/sign-in.md). This reference explains the boundaries
that implementations and integrations must preserve.

## Roles and server scope

There are Admin and User roles. Admins manage configuration, accounts and the fleet.
Users read explicitly granted servers through direct grants or effective group
membership. Server-list, detail, chart, history and resource reads apply that scope
in SQL; an inaccessible object is not exposed through an alternate endpoint.
Unlisted server IDs do not bypass authorization.

Access mutations hold the exclusive global access gate and advance its revision.
Reads and domain writes take the corresponding shared gate, establish current
session authority, apply role/server checks and recheck session time after later
domain locks before completing. A previously authorized browser view is not an
authorization token for a later mutation.

Authorized JSON responses carry `access: {account_id, revision}`. Revisions are
decimal strings, not floating-point counters. The shared browser consumer rejects
an account change and obsolete revisions, clears/refetches affected views and
prevents a late response from restoring data from earlier permissions. Background
refresh, pagination, open dialogs and detail requests need the same discipline.

## Cookies, requests and replay

The cookie is `__Host-tinywarden_session`: Secure, HttpOnly, SameSite Strict,
Path `/`. Local sessions have an eight-hour maximum and 30-minute idle limit;
OIDC sessions have a one-hour maximum and the same idle limit. At most five sessions
are retained per account. Disabling an account, changing authentication version or
revoking authority invalidates subsequent requests.

Operator mutations require the canonical Origin and
`X-TinyWarden-Request: 1`; cross-site Fetch Metadata is rejected. These checks are
in addition to current cookie authorization. Initial-password sessions have a
restricted route set until the password is changed. Agent routes use their own
bearer/generation boundary, never a cookie substitute.

Versioned mutations use a request UUID, fingerprint and expected counters. An exact
valid retry returns its receipt before checking stale expected values, under
current authorization. Reusing a UUID with changed intent conflicts. A new request
with obsolete counters requires a refetch; do not silently overwrite another
editor or replace an uncertain request identity.

Bodies are size/depth/structure bounded. The shared handler caps active roots at 64,
unauthenticated body readers at eight, and body reading at 15 seconds. Safe errors
log a category/request ID, without dumping credentials, environment or bodies.

## Local and OIDC identities

Local mode requires Admin-created accounts. OIDC mode admits every user authorized
by the configured provider as a User, without a separate TinyWarden user allowlist.
Admission grants no server access. Local User password sign-in is blocked in OIDC
mode; an enabled local Admin remains available for recovery. Provider claims never
silently promote an account to Admin.

OIDC identities bind issuer and subject; matching email/username is not identity
proof and never merges accounts automatically. Provider group claims may supply
effective membership through explicitly configured mappings. Those leases expire
after one hour and refresh on sign-in; provider-side revocation is not an instant
TinyWarden session revocation. Manual membership is independent. Configuration
changes revoke affected provider sessions, memberships and login ceremonies.

The implementation uses a confidential Authorization Code flow with PKCE S256 and
RS256, discovery/issuer validation and HTTPS same-origin provider endpoint rules.
Read the [operator configuration guide](../operating/sign-in.md) before changing
issuer, secret or group mappings. Preserve one usable local Admin; switching modes
requires that recovery credential to be ready.

## Verified email and local recovery

Email verification is separate from provider claims and notification routing.
Verification/reset links are single-use and only the newest request remains valid.
GET displays a confirmation page; it does not consume a token. Verification lasts
one hour, password reset 30 minutes. Local reset requires an enabled account with
a local credential and verified mailbox, and does not enable/promote it. Password
recovery responses do not disclose whether a username exists.

The account-email queue suppresses stale work rather than delivering old reset
links. Secrets and bearer link values must not enter application logs, public
examples or history facts. See [jobs and email](../operating/jobs-and-email.md) for
delivery prerequisites and [recovery](../operating/backups-and-recovery.md) for
restored sessions/tokens.

## Source

[Session authorization](../../server/access/session.ts),
[scope/gates](../../server/access/scope.ts),
[administration](../../server/access/administration.ts),
[HTTP guards](../../server/http/response.ts),
[OIDC implementation](../../server/access/oidc.ts) and
[browser authority consumer](../../components/operator/authority.ts) own these rules.
Changes need isolated database tests for concurrent revocation, late responses,
exact retries and denied cross-scope reads, not just a successful Admin request.
