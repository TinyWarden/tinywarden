# Accounts, profiles and OpenID Connect

## Account and login methods

An account has a permanent internal ID, username, Admin/User role, enabled state,
server/group assignments and personal dashboard preferences. Its optional profile
contains a display name and email. Local password hashes and linked external
identities are separate records. Connecting an identity preserves the account ID,
role, assignments and history. Accounts created by OIDC have no local password.

Open **My account** in the account menu (`/account`) to edit your display name and
email, see login methods and provider groups, connect an identity or disconnect it.
Local password changes remain at `/account/password`, with live policy and matching
confirmation checks. Profile and Sign-in field help is available beside each label;
Sign-in setup uses the same tooltips; account provisioning is explained in an info alert. Unchanged
forms disable Save without a status message; edited settings show Unsaved.
Admins edit profiles and
access in **Settings → Users & groups**, with names, email and login methods in the table.
Search matches usernames, display names and email addresses.

Email is optional and is not an account-linking identifier or a notification
subscription. New/changed addresses are unverified; changing an address clears its
verification. Provider profile information initializes a new account, then profile
edits remain local. Even a provider's verified-email claim does not enable local
email recovery. Mailbox verification and local password reset links are available
when SMTP is configured; see [email verification and recovery](account-recovery.md).
Email invitations are not implemented. Local users retain administrator resets; an admin can explicitly
**Enable local password** for an account created through SSO. The temporary
password must be changed after local sign-in. In OIDC mode, this password can only
be used by an Admin; Users can use it after switching to Local accounts. The existing native reset-password
command targets the original account without changing its enabled state or role.

## Configure authentik

One OIDC provider is supported per installation. Open **Settings → Sign-in**
(`/settings/sign-in`). Choose **Local accounts** or **Identity provider (OIDC)**.
Local mode hides provider settings and disables provider sign-in. OIDC mode admits
provider-authorized people automatically and blocks password sign-in for local
Users. Enabled local Admins retain password fallback. The integration uses a
confidential client, Authorization Code, PKCE S256 and RS256 signed ID tokens.

1. In authentik, create an OAuth2/OpenID Provider and associate it with an application
   for TinyWarden. Select a signing key for RS256 and a confidential client.
2. Set an exact redirect URI to the **Redirect URI** shown by TinyWarden:
   `https://YOUR-APP/api/v1/operator/oidc/callback`. Use strict matching, not a regex
   or wildcard. Allow the authorization code flow and the `openid`, `profile` and
   `email` scope mappings. Refresh tokens/offline access are not required.
3. Use authentik's default per-provider issuer mode. Copy its exact issuer from
   the discovery document, commonly
   `https://YOUR-AUTHENTIK/application/o/YOUR-APPLICATION-SLUG/`. TinyWarden verifies
   that discovery returns that exact issuer. The global issuer mode with discovery
   hosted at a different path is not supported in this initial integration.
4. Add `TW_OIDC_CLIENT_SECRET` to the app's private environment file, using the
   confidential client's secret. Restart the web service so its environment is
   refreshed. Keep this file restricted to its service account; do not put the
   secret in a browser field, Git, logs or chat. On the native installation, this
   is `.env.production.local` in the app checkout and
   `systemctl --user restart tinywarden.service` for its service user.
5. In TinyWarden, select **Identity provider (OIDC)**, enter the button label,
   issuer URL and Client ID, then choose **Switch to identity provider**. The login page now shows **Continue with [button label]**.
6. To grant access using provider groups, create TinyWarden groups and server grants
   in Users & groups, then add exact provider-group → TinyWarden-group mappings in Sign-in.
   The groups claim defaults to `groups` and must contain an array of group names
   in the ID token or subject-checked UserInfo response. In authentik, include a
   scope mapping exposing that list with one of the requested scopes. Group names
   are case-sensitive; an empty/missing list removes previous provider memberships.

See [authentik's OIDC provider guide](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)
for issuer mode, endpoints and scope mapping configuration.

Both the browser and app server need to reach authentik. HTTPS endpoints must
have a valid trusted certificate. Endpoint origins must equal the issuer origin;
provider responses cannot redirect server requests to another origin. This permits
an explicitly configured private homelab issuer. Metadata/JWKS/token/UserInfo
responses are limited to 256 KiB with five-second network timeouts.

## Existing accounts and new users

In OIDC mode, anyone successfully authorized by the configured provider can sign
in. A first sign-in automatically creates a User with no local password and no
direct servers. There is no separate allowlist or account-creation switch in
TinyWarden. Configure the provider’s application access policy to control admission.
Mapped groups and local server assignments control what an admitted user can view;
without grants, they can sign in but see no servers. Provider role/admin claims
never promote an account. Administrators assign Admin manually in Users & groups.
TinyWarden’s disabled-account state still denies access, even if the provider
allows that identity.

Existing linked identities keep their account IDs, roles and grants. Email and
username are never used to merge accounts: an unlinked existing local User will
receive a separate User account on first OIDC sign-in. A local Admin can connect
their own identity from My account after recent local sign-in (less than 15 minutes
old). The original session must remain valid until callback. An identity connected
elsewhere cannot be transferred. With connected accounts, issuer and Client ID are
immutable until all identities are disconnected. Disabling OIDC does not disconnect
them. Plan account/grant migration before switching existing local Users; automatic
account merging and an administrator identity-transfer UI are not implemented.

External identity is `(protocol, issuer, subject)`, linked to the internal account
ID. OIDC's issuer and subject identify a user; email and preferred username can
change or be reused. [OIDC claim stability](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability)
Manual and provider group memberships are stored separately. Effective server
access is the union of direct grants, manual groups and unexpired provider groups.
The Users & groups editor shows provider groups separately from editable manual assignments.

## Sessions, revocation and recovery

- OIDC sessions last at most **one hour**, with the existing **30-minute idle limit**.
  Tokens are used during sign-in and discarded; refresh tokens are not stored.
- Group claims synchronize at each provider sign-in. Removing a claimed group
  removes that provider assignment and invalidates the account's prior sessions
  when the effective group set changes. Manual assignments are preserved.
- Provider group grants expire one hour after the last successful provider sign-in,
  including when the user subsequently signs in locally. They do not remain as
  permanent local grants. Reauthentication renews them.
- Disabling a TinyWarden account is immediate for subsequent requests. Disabling or
  saving provider configuration revokes its sessions, pending ceremonies and group
  grants. All connected users need to sign in again after such a save.
  Selecting OIDC also deletes local User sessions; authorization rejects any stale
  local User session while OIDC is active. Switching back never restores deleted
  sessions. Local Admin password sessions remain available.
- Disabling a user solely in authentik or changing its groups is checked at the next
  sign-in. Existing sessions/grants can remain for up to one hour. SCIM and provider
  back-channel/front-channel logout are not implemented in this release.
- **Sign out** ends the TinyWarden session only. The authentik session remains; the
  next provider sign-in may complete without entering a password. Provider passwords,
  MFA and recovery remain managed by authentik.
- Disconnecting an identity requires a usable local password and removes its group
  grants and sessions. In OIDC mode only a local Admin can use this fallback.
  Users can disconnect in Local mode after an administrator enables a local password
  and they complete its initial password change.
- While OIDC is enabled, keep at least one enabled local Admin whose initial password
  has been changed. No account gains a protected role. Another ready local Admin
  allows the current local Admin to be disabled/demoted.

Authorization ceremonies expire after ten minutes, are used once and are bound to
a dedicated Secure/HttpOnly/SameSite=Lax cookie. The ordinary session cookie remains
Strict. `/login/complete` is a public same-origin completion screen: it checks the
Strict session cookie after the cross-site redirect chain has ended, then opens
Dashboard or My account. No tokens/codes are passed to this screen. Opening a second
ceremony in the same browser replaces its ceremony cookie; finish one at a time.

## API and storage

All own-account and admin endpoints use the existing cookie, no-store responses
and access-authority envelopes. POSTs require the HTTPS origin and
`X-TinyWarden-Request: 1`; JSON bodies use `schema_version: 1`.

| Endpoint under `/api/v1/operator` | Method | Purpose |
| --- | --- | --- |
| `/profile` | GET | Own profile, login methods, live provider groups and profile/access revisions. |
| `/profile` | POST | `expected_revision` (profile), `display_name`, nullable `email`. |
| `/oidc/settings` | GET | Admin configuration, mappings, groups, callback URI and secret-configured flag. Never the secret. |
| `/oidc/settings` | POST | Admin: access `expected_revision`, `label`, `issuer`, `client_id`, `enabled`, `groups_claim`, `mappings`. |
| `/oidc/options` | GET | Public enabled provider ID/button label, or null. |
| `/oidc/start` | POST | `intent: login` or authenticated `link`; returns authorization URL and ceremony cookie. |
| `/oidc/callback` | GET | Provider's state/code response; validates ceremony/token, then redirects to completion or a generic login error. |
| `/oidc/unlink` | POST | Own `identity_id` and access `expected_revision`. |

Mappings are `{external_group, group_id}`, limited to 128 unique pairs. Claimed
lists have at most 256 names, each at most 256 characters. Subject IDs have at most
255 characters. Groups selectors currently expose the first 1,000 local groups.
Account create/save APIs accept optional `display_name` and `email` together;
profile saves also require `expected_profile_revision` from the account read,
preventing an administrator from overwriting a concurrent own-profile edit;
administrator password resets accept explicit `enable_local: true` when adding a
local credential to an SSO account. Without it an SSO-only account cannot be reset
into having a local password. New session metadata includes `display_name`,
`local_password`, `auth_method` and `sign_in: {method, provider_label}` alongside
existing authority and role fields. `local_password` reports stored credentials;
active-mode policy still decides whether they can be used.

Migration 027 adds profiles without changing credentials/accounts. Migration 028
adds provider configuration, external identities, mappings, separate leased group
memberships, login ceremonies and session-method references. Existing sessions
remain local. Neither migration deletes history or rewrites existing permissions.
Recovery uses a matching database backup and app runtime; there is no destructive
down migration. Provider network calls and password hashing happen outside
transactions holding access/account/session locks. Audit records include operation,
actor, target and revision, without profile email, secrets, codes or tokens.

SAML and multiple-provider configuration can extend identity/provider records in
later releases. They are not available in this release.

The legacy `oidc_providers.auto_create` storage column is retained for database
compatibility. It is no longer returned/accepted by the settings API or consulted
during admission, including for existing rows set to false. Saves write true;
no database migration is required for this behavior change. `enabled` continues
to represent the saved method. Switching to Local keeps provider configuration and
mappings for a later switch, but immediately revokes provider sessions/grants.
