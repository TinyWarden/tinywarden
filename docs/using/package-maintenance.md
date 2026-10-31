# Maintain Debian packages

The **Package updates** skill provides **Refresh package lists** and **Upgrade
packages**. Its ordinary **Check now** button only reads the cached package plan.
These operations are available in Updates 1.3.0; earlier releases used the label
Conservative upgrade and a different native execution policy.

## Enable operations

Install the skill from **Skills → Manage skills**, then review each exact version's
**Allow action** permission in its **Skill actions** section. Monitoring permission
alone cannot authorize package changes. A new package version requires renewed
action permission; it cannot start an older job under a new grant.

Use a recognized managed agent with SDK3/actions on Debian 13 amd64. These actions
explicitly declare local verification and require agent 0.0.24 or later. The agent's
local policy must also permit the publisher and `host_admin` execution class.
Both operations need `apt-get`, supplied by Debian's `apt` package. Python APT
bindings are not required. TinyWarden does not install prerequisites automatically.

**Agent settings → Maintenance actions** (or **Agent details** for a read-only
account) shows current readiness and verified missing packages. Old or failed
reports cannot establish that a prerequisite is missing. See
[agent policy and recovery](../operating/agents.md#package-maintenance-and-read-only-recovery).

Both operations work with monitoring paused and with no other skills installed.
Disk Space, Reboot Status, Services and other readings do not approve, block or
judge them. Their warnings still contribute to the server's displayed health.
Another active or unresolved operation, or an agent update, excludes conflicting
work on the same server.

Package scripts run as root and may restart services or fail after changing the
server. There is no automatic package rollback, repair or reboot. Keep an
independent way to reach the server.

## Refresh package lists

On the server, select **Operations → Refresh package lists** beside **Check now**
and **Settings**. Fleet offers **Manage server → Skill actions… → Package updates
→ Refresh package lists**. One click starts it on that server; other selected rows
have no effect. For several servers, use **More actions → Skill actions…** and
review the explicit eligible targets before continuing.

The skill runs these commands:

```sh
apt-get update --error-on=any
apt-get --simulate upgrade
```

The first refreshes indexes. Its strict error option treats a failed repository
refresh as an error. The second reads a plain upgrade summary and installs nothing.
It uses the same fixed options as Upgrade packages, preserving holds and excluding
new packages even when administrator APT defaults allow a broader operation.
It is independent of the monitoring `package_mode` setting. If refreshing succeeds
but the summary fails, the result says so and retains both commands' output/exits.

One dialog keeps its title, server and Close control while the status changes.
Open the collapsed **Execution log** to see actual native output. Closing the
dialog does not cancel work. Use **View progress** to reopen active work.

## Preview and approve an upgrade

Select **Operations → Upgrade packages**, or choose the same action in Fleet.
The skill reads a plain `apt-get --simulate upgrade` preview from cached indexes.
It does not refresh indexes or install anything during preparation. Run Refresh
first when you want current lists. If there are no upgrades, it finishes with
**Nothing to upgrade**.

Otherwise, review the package names and installed/candidate versions, then approve
**Approve and run**. Approval authorizes ordinary `apt-get upgrade` on the displayed
server under the skill's stated policy. **The package list is a preview, not a
frozen transaction:** APT resolves packages again when the command runs. The app
still binds consent to that exact skill version, input, settings, plan and server.

Choose **Cancel operation** beside **Approve and run** if you do not want to
proceed. It requests cancellation of this server's unapproved operation, keeps
the saved history and releases the reservation once a safe stop is confirmed.
The **×** in the header only closes the window; the request remains pending and
can be reopened. Cancelling a preview does not install packages.

The command runs noninteractively with these explicit limits:

- Preserve held packages; do not install new packages, remove packages or downgrade.
- Keep locally modified configuration files, using `--force-confdef` and
  `--force-confold`.
- Set `DEBIAN_FRONTEND=noninteractive` and `NEEDRESTART_MODE=l` (list only).
- Do not request full-upgrade, autoremove, automatic repair or a reboot.

APT owns locking, resolution, downloads and installation. Its ordinary repository
configuration is used, including native mirror and local-source methods. The skill
does not predict disk/boot capacity, disable services or certify unrelated service
health. Native errors appear in the log. A successful command can coexist with a
separate reboot warning or another skill's warning.

A nonzero exit is a failed operation. It may have made partial changes; inspect the
native error and package state before choosing another operation. A lost receipt
or unconfirmed process remains uncertain and follows recovery instead of being
silently repeated.

For multiple servers, review the exact targets and execution order. Each server
needs its own plan and authority; a failed or uncertain item stops further dispatch.

## Results and logs

**View result** opens settled work. Results survive reload and remain under
**Operations → Recent results** and **Activity → Operations → Details**. The **×**
control dismisses a finished notice across your account's devices without deleting
the saved result. Running or unresolved work cannot be dismissed into completion.

The **Execution log** starts collapsed, including on failure. When opened, it shows
commands, stdout/stderr, native exits and runtime diagnostics in one transcript.
**Copy** and **Download** export all retained text. Capture is bounded and redacted;
truncation is labelled. Old records that contain only events explicitly say native
output was not captured. Normal background reads do not disable controls.

## Cancellation and uncertain execution

While Upgrade packages is waiting for the agent or preparing its preview, **Cancel**
is available directly in the footer. The approval preview offers **Cancel operation**
beside **Approve and run**. A pending cancellation stays visible and disabled until
its outcome arrives. Once installation starts, closing the
window does not stop APT, and TinyWarden does not force-kill dpkg to satisfy a UI
timeout. Failed network reads preserve the last known state and provide a retry.

A verified, stopped command with a known outcome releases execution exclusion,
including a known failure. An uncertain outcome keeps **Verify and unlock** available
from the server/Fleet and the exact saved operation. Recovery inspects retained
state without repeating installation. Follow the displayed CLI authorization and
explicit acknowledgement steps. It preserves the original result; it does not
turn uncertainty into success. See [recovery](../operating/agents.md#package-maintenance-and-read-only-recovery).
