# Maintain Debian packages

Administrators can run **Refresh package lists** and **Conservative upgrade** from
Fleet, for one server or up to 100 explicitly selected servers. These are reviewed
platform actions. Monitoring skills continue to observe and report separately.

## Before you start

Use a recognized managed agent on Debian 13 amd64 with maintenance support.
Install the host's missing maintenance prerequisites locally: `apt-get` comes from
the Debian `apt` package, and the Python APT bindings come from `python3-apt`.
They are optional for monitoring and agent updates; TinyWarden does not install
them automatically. An older agent needs an agent update first.

On the server page, open **Agent settings → Maintenance actions** to see readiness
and the exact missing packages (`apt` provides `apt-get`). Accounts with read-only
access use **Agent details**. Install only the listed packages locally and wait for
a fresh agent report. An old report, unrecognized installation or unavailable
worker has its own explanation; it does not establish that packages are missing.

Conservative upgrade requires active monitoring and fresh compatible verification
checks. A known critical or unknown required baseline blocks approval. Refresh is
also available while monitoring is paused. Another maintenance job, unresolved
package transaction or agent update prevents conflicting work. Menus show available
actions; mixed selections name the eligible servers and explain skipped targets.

Keep current backups and a way to reach the server independently. Package scripts
run as root and can restart services or fail after making changes. There is no
automatic package rollback or reboot. A database backup cannot undo host packages.

## Refresh package lists

1. Open a server's menu, or select servers and open **More**.
2. Choose **Refresh package lists** and review the named targets.
3. Confirm **Refresh package lists**. This updates indexes, without installing packages.
4. Follow progress, or close the dialog and return through **Activity → Operations**.

A failed repository or trust check is a failure, not a successful partial refresh.
Refresh completion does not establish that services are healthy.

## Prepare and approve a Conservative upgrade

1. Choose **Conservative upgrade**, review the targets and select **Prepare plans**.
   Preparation refreshes package lists and saves proposed changes; it does not
   install them.
2. Open **Review plan** for each server. Review exact installed/reviewed versions,
   architecture, download and unpack estimates, kept-back packages and verification
   coverage. Page controls expose the complete lists.
3. Select the ready plans you want to approve. Choose **Review and approve**,
   inspect the named excluded servers and choose the first/canary server.
4. Acknowledge the disclosed service-restart and failure risks, then approve the
   exact reviewed plans. Plans expire after 30 minutes. Changed or expired plans
   need fresh preparation and review.
5. Installation proceeds one server at a time in the saved order. The next server
   starts only after the previous server passes verification. Failure or uncertainty
   stops further dispatch; it does not select a different canary automatically.

Only installed packages may be upgraded. The action preserves holds and cannot add
or remove packages, downgrade or reinstall versions, autoremove, run full-upgrade
or repair a broken package database. A package that needs such changes is kept
back for separate local review. A clean result may therefore leave updates pending.

Modified local configuration is retained where supported. Results separately show
whether a reboot, configuration review or service-restart review is needed.
Unknown means that the fact could not be established; it does not mean “No”.
TinyWarden does not automatically reboot or restart additional services through
needrestart. Package maintainer scripts can still restart affected services.

Verification checks local package integrity and exact installed versions, fresh
agent contact and new observations from the saved configured checks. Pre-existing
warnings remain visible; new or worsened required problems block completion. If
no optional checks are configured, coverage is limited to mandatory package and
agent checks. That result does not establish service health.

## Cancellation, lost replies and recovery

Closing the window leaves the operation running. **Cancel remaining** requests a
safe stop before installation and prevents later servers from starting. A package
transaction already applying is allowed to settle and is still verified. A time
limit does not kill it, remove its locks or make it safe to start another action.

If a request's reply is lost, **Retry** repeats the saved request. Do not create a
second operation to work around an uncertain result. Return to saved operations
through Activity. After a failed or expired plan, review remaining targets and
prepare/approve new plans explicitly.

**Acknowledge result** records that an Admin reviewed an eligible terminal result;
it preserves the original outcome and does not retry installation. Uncertain local
execution may need manual package repair followed by **Read-only recovery**.
The recovery dialog supplies a command and a short-lived, single-use authorization
for that server's saved job. Enter the authorization at the CLI's hidden prompt.
Keep it private; a lost or expired code needs a replacement before first acceptance.
After acceptance, resume the saved command on the same server to finish receipt
delivery. Recovery checks integrity and closes old execution; it does not replay
an upgrade or turn a failed result into success. See the
[operator procedure](../operating/agents.md#package-maintenance-and-read-only-recovery).

Operation details follow configurable retention, default 90 days. Active or
unresolved work retains its safety evidence until it is reconciled.
