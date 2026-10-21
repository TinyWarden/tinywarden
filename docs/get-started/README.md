# Get started with TinyWarden

TinyWarden observes configured checks on Linux servers. It does not automatically
repair problems. You need an application installation, an enabled administrator
account and an outbound-connected host agent on each monitored server.

1. [Install the application](../operating/install.md), or use the HTTPS address
   provided by its administrator.
2. Sign in. Local accounts are created by administrators; in OIDC mode the identity
   provider decides admission. See [accounts and sign-in](../using/accounts.md).
3. As an administrator, choose **Add server**, name it and use the setup code with
   the [host-agent installer](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/deploy/native.md).
4. Open **Skills → Manage skills**. Install a package, review its requested access
   and enable it. Compatible agents receive the assignment on their next connection.
5. Open the server and inspect its first fresh readings. Services also needs an
   explicit per-server target selection; an empty selection is Not configured.

The [dashboard](../using/dashboard.md) summarizes current health. Online contact
and a healthy skill are different signals. Read the actual check's reason and scope
before acting. [Official skill meanings](../using/skills.md) explain their limits.
Administrators can grant other users access through
[Users & groups](../using/settings.md#users-and-groups).
