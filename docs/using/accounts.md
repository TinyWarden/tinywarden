# Accounts and recovery

Open **My account** from the account menu to edit display name/email and inspect
available sign-in methods. Your internal account identity, permissions and dashboard
preferences remain separate from profile text. Changing an email does not merge
accounts or subscribe you to monitoring alerts.

## Passwords and sign-in methods

Local accounts use a username and password set initially by an administrator.
Change password at `/account/password`; the form shows the current password policy
and requires confirmation. An administrator can reset a local password or explicitly
enable a local password for an SSO-only account. The temporary password must be
changed after local sign-in. In OIDC mode local password fallback works only for
Admins; ordinary Users use the provider.

With OIDC active, successful provider authorization creates a User automatically.
Existing unlinked local accounts are not merged by username/email. A local Admin
can connect their own identity after a recent local sign-in. Linking preserves
that account's permissions. An identity already linked elsewhere cannot be moved.
Provider-created accounts have no local password by default.

Provider sessions last at most one hour with a 30-minute idle limit. Groups refresh
at provider sign-in; provider group grants expire after an hour unless renewed.
Manual grants remain separate. Provider-only disable/group changes may take until
reauthentication/session expiry to take effect. Disabling the TinyWarden account
applies to subsequent requests. Sign out ends the TinyWarden session, not necessarily
the provider's session. Recovery/MFA for provider-only accounts belongs to the provider.

## Verify an email

Save the address, then choose **Verify email**. Local/hybrid accounts confirm their
current local password; an SSO-only account needs a provider sign-in within the last
15 minutes. Delivery is asynchronous. Request success is not inbox delivery or
verification. Open the newest link and choose **Verify this email**; opening the
page alone does not consume it.

Verification links expire after one hour and work once. Request another after a
minute if needed. Changing the address clears verification and invalidates old
links. A provider's verified-email claim is not local mailbox verification. An
administrator can edit an address but cannot mark it verified.

## Forgot password

When account email is enabled, choose **Forgot password** and enter the local
username. The response is generic. A reset message is eligible only for an enabled
account with a local password and a previously verified mailbox. Email can be shared;
the username selects the account.

Reset links expire after 30 minutes and work once; a newer request replaces the
older link. Choose and confirm a new password, then sign in normally. A reset
revokes existing sessions and provider group leases, preserving account ID, role,
manual grants, preferences and history. No verified email means administrator
recovery. Mail unavailable at sign-in shows the administrator-reset route instead.

Changing email/password/authority or disabling the account can invalidate a link.
Request a fresh link rather than replaying an old message. Successful password
changes can send a notice to the verified mailbox. Mail status and configuration
are covered in [account email operations](../operating/jobs-and-email.md#account-email).
