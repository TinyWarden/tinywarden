# Accounts, groups and server access

An installation has two roles. **Admins** see and manage everything. **Users**
can view assigned servers, their skill results, graphs and retained history.
Users can customize their own dashboard, change their password and sign out.
They cannot run skills, manage servers, install skills or change shared settings.

## Manage access

Open **Settings** from the account menu, then choose **Users & groups** in the sidebar
(`/settings/users`).
Create an account in Users, then
edit it to select direct servers or groups. Create a group in Groups and select
its members and servers. Lists and selectors are alphabetical, searchable and
paginated, with 50 items per page. Selections persist across pages.

Direct and group grants add together. Removing a direct grant does not remove
access granted by a group. Removing a group removes only that group's grants.
There are no nested groups or deny rules. New servers need an explicit assignment
for users. No assignments means “No servers assigned.” A grant includes retained
history from before the grant. Disabling an account retains its assignments;
re-enabling it requires a new sign-in.

All admins follow the same rules. Another admin can disable or demote any admin,
including the original `admin` account. At least one admin must remain enabled;
admins cannot disable or demote themselves. These checks run under the exclusive
access gate, so simultaneous changes cannot remove every admin. Accounts are
disabled rather than deleted, preserving audit references.

## Passwords and sessions

Admins enter an initial or reset password and share it separately. The user must
change it at next sign-in. Until then, only session status, own password change
and logout are available. Own password changes require the current password and
a different new password. They revoke all sessions, including the current one.
Admin resets, role changes and disabling also revoke sessions. Grant changes keep
sessions, with subsequent requests using the updated scope.

Password policy and secure cookies remain defined in [Access](../security/access.md).
Email invitations are not implemented. Verified local accounts can use
[password reset emails](account-recovery.md) when SMTP is configured. The native reset-password
command resets the original account’s password without changing its role or disabled
state. Native skill administration selects an enabled local admin whose initial
password has been changed, preferring the original account when eligible.

## API

These endpoints use the existing operator cookie, no-store responses, HTTPS origin
and `X-TinyWarden-Request: 1` rules. Request bodies include `schema_version: 1`.

| Endpoint under `/api/v1/operator` | Method | Purpose |
| --- | --- | --- |
| `/access/users`, `/access/groups` | GET | Admin list; `page`, `search` |
| `/access/users/{id}`, `/access/groups/{id}` | GET | Admin account/group read |
| `/access/users/{id}/choices/hosts` or `/choices/groups` | GET | Direct servers or memberships; inherited group names accompany servers |
| `/access/groups/{id}/choices/hosts` or `/choices/users` | GET | Group servers or members |
| `/access/users` | POST | Create: `expected_revision`, client UUID `id`, `login`, `role`, `password` |
| `/access/groups` | POST | Create: `expected_revision`, client UUID `id`, `name` |
| `/access/users/{id}` | POST | Save role, disabled, host/group deltas |
| `/access/groups/{id}` | POST | Save name, host/member deltas |
| `/access/users/{id}/password` | POST | Admin reset: `expected_revision`, `password` |
| `/access/groups/{id}/delete` | POST | Delete: `expected_revision` |
| `/password` | POST | Own change: `current_password`, `new_password`; 204 clears cookie |

Save bodies contain `expected_revision` and `add_hosts`/`remove_hosts`, plus
`add_groups`/`remove_groups` for users or `add_members`/`remove_members` for groups.
Each set is unique, disjoint from its opposite, and limited to 256 UUIDs.
Access bodies are capped at 128 KiB. Revision conflicts return 409; reload and
review before editing again. Writes are not automatically repeated. If creation's
response is lost, inspect its original UUID instead of creating a second account.
Password material is never included in read responses, logs or audit metadata.

## Enforcement and revocation

Every operator root validates database authority. Admin-only reads and mutations
return 403 for users. Unavailable host IDs return the same 404 as nonexistent
servers, including mixed History filters. SQL scopes lists, totals, choices and
history before pagination. Agent credentials and background jobs retain their
independent authority; they do not use operator ACL locks.

`access_control_state` is a shared row gate taken before account/session/package
locks. Access changes take it exclusively, update its revision and audit atomically.
Read-only repeatable snapshots retry serialization failures with a fresh snapshot;
writes do not retry. A read already holding the gate may complete before revocation
commits. Previously delivered data cannot be recalled.

Operator read envelopes include `access: {account_id, revision}` from their own
authorization transaction. Request-local response context prevents authority from
mixing between concurrent requests. Clients reject older or different-account
responses and mixed-revision pages. A changed revision clears cached server,
history, graph, badge and title data. Session authority is rechecked every 30 seconds
and on navigation/focus; 401 clears state, while 403/404 clears affected readings.

## Identity and migration

Migration 024 preserves the existing admin UUID, exact credential, sessions,
dashboard layout and server history. Local credentials move to an optional
one-to-one table, preparing accounts for external identities. Recovery uses a
matching backup and runtime; there is no destructive down migration.

OIDC provider configuration, explicit linking, exclusive Local/OIDC sign-in and group mappings
are available in [Accounts and SSO](accounts-and-sso.md). External identities link
issuer and subject; email never connects accounts automatically. External group
membership remains separate from manual membership, with a one-hour lease. Creating
an account does not subscribe it to notification emails. Profiles, email verification
status and local/provider login methods appear in My account and Users & groups. Email
verification and self-service local password resets are documented in
[Account recovery](account-recovery.md).
