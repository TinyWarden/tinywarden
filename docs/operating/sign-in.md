# Configure sign-in

Choose one method in **Settings → Sign-in**. Local accounts are created by
administrators. OIDC admits anyone authorized by the provider as a User; server
grants remain a separate permission decision. Keep an enabled local Admin with a
changed initial password for fallback. Local Users cannot password-sign-in while
OIDC is active.

## OIDC provider

The installation supports one confidential OpenID Connect provider using the
Authorization Code flow, PKCE S256 and RS256 ID-token signatures.

1. Create the provider application/client with openid, profile and email scopes.
2. Copy the exact Redirect URI shown by TinyWarden:
   `https://YOUR-APP/api/v1/operator/oidc/callback`. Use strict matching.
3. Obtain the exact issuer from provider discovery. Discovery must return that
   issuer and endpoints on its origin, reachable by the app with trusted HTTPS.
4. Put the client secret in private `TW_OIDC_CLIENT_SECRET` and restart the web
   service to refresh its environment.
5. Choose OIDC in TinyWarden, enter the button label, issuer and Client ID, and save
   the switch. Keep the secret out of browser fields, Git and logs.
6. Optionally map exact provider group names to TinyWarden groups with server grants.
   The configured groups claim defaults to `groups` and must be an array of names.

For authentik, use its per-provider issuer such as
`https://YOUR-AUTHENTIK/application/o/YOUR-APPLICATION/`, with an RS256 signing key
and matching scope mappings. A global issuer whose discovery path differs from
that issuer is unsupported by this integration. Do not infer issuer from a button label.

## Admission and account continuity

New provider identities receive enabled User accounts with no local password or
direct servers. There is no TinyWarden admission allowlist/switch. Restrict provider
application access to control admission; configure local/manual/provider-group
server grants for visibility. Provider roles do not promote Admin. A disabled
TinyWarden account remains denied.

Identity is issuer/subject, not email or username. Existing unlinked local accounts
are not automatically merged. A local Admin can link their own identity after a
local sign-in within 15 minutes. The same session must survive callback. Connected
issuer/Client ID cannot change until identities are disconnected. Plan existing
user/grant continuity before switching methods; automatic identity transfer is not
available.

## Sessions and changes

Provider sessions and group leases last at most an hour; idle timeout is 30 minutes.
Claims synchronize on provider sign-in. Missing/empty claims remove provider
memberships while manual grants remain. Provider-only disable/group changes are
checked on the next sign-in, so existing access can persist until session/lease
expiry. SCIM and provider back-channel logout are unsupported.

Saving provider configuration revokes its sessions/ceremonies/group grants. Switching
to OIDC also invalidates local User sessions; local Admin fallback remains available.
Switching back does not restore deleted sessions. Sign out ends TinyWarden's session,
not the provider session. Provider-only recovery and MFA stay with the provider.
