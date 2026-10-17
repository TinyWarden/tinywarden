# Email verification and local password recovery

## Verify an address

Open **My account** (`/account`), save an email, then choose **Verify email**.
Local and hybrid accounts confirm their current local password in the Playbook
modal. An SSO-only account must have signed in with its provider within 15 minutes.
The modal emphasizes the saved destination address. After a successful request,
the profile's recovery alert shows **Verification requested** and delivery guidance.
This confirms the request, not mailbox verification or delivery.
Delivery is asynchronous; check your inbox after about a minute. Open the link and
choose **Verify this email**. Opening the page alone does not confirm it.

Verification links expire after **one hour**, are single use and only the newest
verification link works. Reload My account to request another after a minute.
Changing the address clears verification and invalidates old links, including when
changing back to the original address. Display-name edits preserve it. Admins can
edit an email but cannot mark it verified. Provider `email_verified` claims do not
count as this mailbox proof. Verifying an SSO-only profile never adds a local password.

## Recover a local password

The sign-in footer shows a centered **Forgot password** link when account email
delivery is enabled. Otherwise it shows the administrator-reset message. Only one
is displayed; while mail readiness is loading, neither is shown. If readiness
cannot be checked, the administrator-reset message is the fallback.

Choose **Forgot password** at sign-in (`/forgot-password`) and enter your **username**.
The reply is always generic for a well-formed username. A message is sent only when
the account is enabled, has a local password and has a previously verified email.
Shared email addresses are permitted; the username identifies which account to reset.

Reset links expire after **30 minutes**, are single use and are replaced by a newer
reset link. Choose and confirm a new password at `/reset-password` using the normal
password policy. A successful reset revokes **all local and OIDC sessions**, clears
provider group leases and outstanding email tickets, and sends a password-changed notice
to the verified mailbox. It preserves account ID, role, manual grants, preferences
and server history. Sign in normally with the new password; there is no automatic login.

Email/password/authority changes, disabling an account or removing its local
credential invalidate a reset link. An account with no verified email needs an
administrator's reset. SSO-only recovery stays with authentik or the configured
provider; an administrator can explicitly enable local login separately. Email
invitations and email-based identity linking are not provided.

A changed-password notice also follows ordinary password changes, admin resets and
the native reset command when the account has a verified mailbox. Notices contain
app-owned content only. Account addresses do not subscribe users to monitoring alerts.

## SMTP and native delivery

Account mail reuses the existing validated SMTP settings. The app and dedicated
`tinywarden-account-emails.service` load private `.env.production.local`, optional
`.env.notifications.local` and optional `.env.account-emails.local`. Mail files
must not override core database, origin or listener settings. See
[configuration](../deploy/configuration.md#account-verification-and-recovery-email).

`ACCOUNT_EMAILS_TRANSPORT` defaults to SMTP when monitoring transport is SMTP;
otherwise it defaults to disabled. An explicit `smtp` enables account mail independently,
and `disabled` pauses it. `ACCOUNT_EMAILS_FROM` overrides `NOTIFICATIONS_FROM`.
SMTP credentials/TLS settings are shared; the account's mailbox supplies the recipient,
not `NOTIFICATIONS_TO`. Monitoring warning/recovery toggles and guarded routing
configuration do not affect account email. Capture mode is not a real account transport.
No new mail-provider dependency or account is required.

On a native installation, install current rendered units and fixed source jobs,
apply migration 029, then enable the separate worker:

```bash
systemctl --user daemon-reload
systemctl --user enable --now tinywarden-account-emails.timer
```

It runs every 30 seconds after the preceding run finishes. Each run inspects at
most 32 jobs and makes at most two SMTP submissions. Network calls and password
hashing happen outside database locks. Requests enqueue quickly without waiting
for the provider; the worker resolves recovery eligibility. Requests older than ten
minutes are skipped. Submission uncertainty, failure or interrupted claims are not
automatically retried. Request a new link if mail does not arrive; check the worker
and SMTP configuration. Relay acceptance does not prove inbox delivery.

The worker deletes expired tokens, stale throttle buckets and completed jobs older
than one day. Stop the account timer after a database restore and clear restored
email tickets/jobs before restarting it. Do not replay backed-up account mail.

## HTTP contract

JSON POSTs use `schema_version: 1`, exact app `Origin` and
`X-TinyWarden-Request: 1`. No query parameters are accepted. Public responses are
no-store and never disclose eligibility, addresses or link secrets. Authenticated
verification requests include the existing authority envelope. All paths below
are under `/api/v1/operator`.

| Endpoint | Method | Body / result |
| --- | --- | --- |
| `/email/options` | GET | Public `{enabled}` mail-readiness flag. |
| `/email/request` | POST | Own authenticated `expected_revision` (profile), `current_password` (null for recent SSO-only). Queues saved-address verification; 202. |
| `/email/verify` | POST | Public `{token}`; consumes valid mailbox proof; 200. |
| `/password-recovery/request` | POST | Public `{login}`; generic 202 for a well-formed username. |
| `/password-recovery/reset` | POST | Public `{token, new_password}`; consumes link, resets and clears browser session cookie; 200. |

Profile GET also exposes `mail_enabled`. Invalid/expired/reused links return 410.
Global request and ticket-attempt budgets are 90/minute; mail requests also have
one/minute and five/hour budgets per username/account. Verification password proof
has a five/minute budget. Anonymous duplicate requests retain the same generic reply;
global exhaustion returns 429. Input, body and process-concurrency bounds remain
in force. Requests never accept a recipient, HTML, subject or alternate redirect URL.

## Storage and link handling

Migration 029 adds an independent email revision, purpose-bound hashed tokens,
a bounded mail queue and separate throttle buckets. Bearer secrets are minted only
in worker memory immediately before submission. Only the digest is stored; jobs and
audit events contain no raw token or password. Tickets bind account authority version,
exact saved email and email revision. Password hashing is followed by a second
transactional validation before consumption, preventing concurrent account edits
from authorizing an obsolete ticket.

Links use the configured HTTPS origin and `#token=…`, never a request header's host.
The browser reads the fragment into memory and immediately removes it from the URL.
Landing pages have no referrer, indexing or caching; no third-party assets are loaded.
Explicit confirmation means mail scanners and ordinary GETs do not consume tickets.
API logging omits submitted link/password data. Email is app-rendered plain text and
HTML with escaped content, validated mailboxes and bounded MIME size.

These choices follow the [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
Email recovery trusts access to the mailbox. Use provider-managed recovery/MFA for
provider-only accounts and keep a working local administrator fallback.
