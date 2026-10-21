# System settings and permissions

Settings is available to administrators through the account menu. The sidebar is
ordered **Skill repositories**, **Agents**, **Users & groups**, **Sign-in**. `/settings`
shows Skill repositories; each section also has its own URL.

## Skill repositories

Add a supported public GitHub repository URL and refresh its catalogue. The app
reads `SKILLS.json` and published release assets, not arbitrary build instructions.
Manage skills handles package installation and update review. Source origin and
requested host access are separate decisions. A repository cannot replace another
source's installed skill merely by claiming the same identity.

## Agents

Configure default host-agent behavior, including automatic updates. A server can
inherit or override the automatic-update setting. A local root-owned prohibition
wins over app policy. These settings control the host platform, while Skills
controls monitoring packages. See [agent maintenance](../operating/agents.md).

## Users and groups

Create local accounts in the Users tab; share the temporary password through an
appropriate private channel. The user must change it after initial sign-in. Edit
profiles, enabled state, Admin/User role, direct server assignments and manual groups.
Groups grant access to their assigned servers. Search includes username, display
name and email.

Admins can manage the installation and see all servers. Users see only directly
assigned servers and those granted through manual or active provider groups. They
have Dashboard, History, their permitted server pages and My account; they cannot
change system monitoring configuration. Provider memberships are displayed
separately from manual assignments.

An administrator cannot disable/demote themselves, and at least one active admin
must remain. The original account has no permanently protected role; another
administrator can change it within these rules. In OIDC mode a ready local-admin
fallback must remain. Email addresses are profile data, not identity-merging keys
or monitoring subscriptions.

## Sign-in

Choose **Local accounts** or **Identity provider (OIDC)**. Local accounts are created
by administrators and use a username/password here. In OIDC mode anyone authorized
by the provider can sign in and receive a User account; TinyWarden has no separate
admission allowlist. Provider policy controls admission, while local/provider group
grants determine which servers an admitted User can see. No grants means no servers.

Local Users cannot password-sign-in while OIDC is active. Enabled local Admins keep
password fallback. Provider groups never assign Admin automatically. Disabled
TinyWarden accounts remain denied. See [OIDC configuration](../operating/sign-in.md)
and [account behavior](accounts.md) before switching existing local users.
