# Maintain Debian packages

Administrators can run **Refresh package lists** and **Conservative upgrade** from
Fleet, for one server or up to 100 explicitly selected servers. These are reviewed
actions supplied by the Updates skill. Monitoring continues to observe and report
without action permission.

## Before you start

Select Updates 1.2.6 or a later compatible package that declares these actions, and
use managed agent 0.0.22+ with a compatible app. In its **Skills** settings, an
Admin reviews and allows each action for that exact package version. The host
must support SDK3/actions and separately permit the publisher and execution class
in its local policy. Monitoring permission alone is insufficient. Changing the
package version requires a fresh action permission review; queued work from an
older version cannot begin under the new grant. Agent 0.0.20 cannot run SDK 3
actions; update older agents before using the current workflow. See
[agent policy and recovery](../operating/agents.md#package-maintenance-and-read-only-recovery).

For other action-capable skills, Fleet uses the same preparation, review, progress
and recovery screens. Names, inputs, plan tables and result facts come from the
selected package. Only available actions appear; an unavailable or unapproved
action does not gain authority by being selected in a bulk request.

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

Conservative upgrade supports HTTP(S) archives and Debian's `mirror+file:` source
format when the protected local mirror list contains only HTTP(S) mirrors.
Archive and mirror policy belongs to the selected Updates package. A mirror list is
different from a local package archive; file/media archives, remote or compressed
mirror lists and unsupported fallback methods still require local review.

## Refresh package lists

For one server, open **Manage server → Skill actions… → Package updates → Refresh
package lists**. Selecting the action starts it immediately on that server. Other
selected rows have no effect. The dialog shows progress, then available update
counts. It refreshes APT indexes and simulates an upgrade; it installs nothing.

One progress window keeps the action title, server and Close button in place from
startup to completion. Its status and compact result rows update in the background.
Pending values are shown as dashes; a reported zero is a real result. Normal reads
do not disable the controls. Once the operation has fully settled, automatic
polling stops. An interrupted connection retains the last known status and offers
**Retry**; it does not establish that the action has stopped.

For several servers, select them, open **More actions → Skill actions…**, choose
Refresh and review the eligible targets before selecting **Continue**.

You can close the dialog. While work is active, the server explains why conflicting
actions are unavailable and offers **View progress** beside its status and in its
menu. These links also work after reloading Fleet. Recent results remain in
**Activity → Operations → Details**.
Close also works while the request is starting. A pending launch remains reopenable
beside the named server. Closing does not repeat or cancel the request, and its
reply does not reopen a window you closed.

Updates 1.2.9 uses action-local verification and needs agent 0.0.24+. Refresh does
not run unrelated monitoring checks before or after APT. A generic waiting connection
lets the agent discover new work promptly; repository response times, contention
and connectivity still affect completion. A waiting or failed action never implies
that packages were installed.

A failed repository or trust check is a failure, not a successful partial refresh.
Refresh completion does not establish that services are healthy.

## Prepare and approve a Conservative upgrade

For an individual server:

1. Choose **Manage server → Skill actions… → Package updates → Conservative upgrade**.
   Preparation starts for that server immediately. It refreshes package lists and
   saves the proposed changes; it does not install them.
2. Review the exact package versions, download size, kept-back packages and
   verification coverage inside the same window. Table pages expose complete lists.
3. Read the action description and service-impact notice, then choose **Approve and run**
   to approve that exact plan. Status then shows the reported execution and verification phases.
4. Read the result in the same window. You can close it at any stage and reopen it
   through **View progress** on the server or Fleet Activity. Closing does not
   approve or cancel anything. If no eligible upgrades are found, the operation
   finishes without approval.

Plans expire after 30 minutes. Changed or expired plans need fresh preparation,
review and explicit approval. If a plan expires, close its saved progress and start
Conservative upgrade again from that server's available Skill actions.

For selected servers, preparation retains explicit target review. Review each
plan, select the ready plans, choose **Review and approve**, and choose the first
server and execution order. Acknowledge the disclosed risks and approve those
exact plans. Installation proceeds one server at a time. Failure or uncertainty
stops further dispatch and preserves the successful changes on earlier servers.

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

Individual-server outcomes appear directly in progress. For a bulk operation, open **Result** on the server's row. Failed
preparation has no installation plan to approve. Review its reason, correct the
cause, then prepare a new plan. Results omit unavailable post-install details when
only package lists may have changed; an uncertain package transaction keeps those
details explicitly unknown.

When nothing can be upgraded, the result says **Nothing to upgrade** and omits
unavailable installation details. Individual progress needs no empty plan or extra
approval. Bulk review tables still name empty sections explicitly. Known zero/false facts remain visible; started or
uncertain actions retain unknown facts for review.

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
**Read-only recovery** is under **Troubleshooting** in a single-server progress dialog when
delivered work is waiting for cancellation or expiry acknowledgement from an
unavailable agent. Reopen it through **View progress**; the same recovery confirmation
and server checks apply. Cancellation or expiry alone does not release the server.
Keep it private; a lost or expired code needs a replacement before first acceptance.
After acceptance, resume the saved command on the same server to finish receipt
delivery. Recovery checks integrity and closes old execution; it does not replay
an upgrade or turn a failed result into success. See the
[operator procedure](../operating/agents.md#package-maintenance-and-read-only-recovery).

Operation details follow configurable retention, default 90 days. Active or
unresolved work retains its safety evidence until it is reconciled.
