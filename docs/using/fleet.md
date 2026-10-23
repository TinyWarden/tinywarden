# Manage your Fleet

Open **Fleet** between Dashboard and Skills. Dashboard focuses on current attention;
Fleet is your server inventory, including paused and archived servers.
Administrators can change it. Other users see only the servers granted to them.

## Add a server

Choose **Add server**, enter a display name and optionally choose Fleet groups and
tags. Create a setup code, copy the displayed command to the server and run it.
The command downloads `install.sh` completely, then runs it with `sudo` only if
the download succeeds. It includes the setup code and connects automatically.
The separate **Setup code** section still lets you copy the code for the installer's
hidden prompt when running the manual command in the installation guide. The
generated command is private and can remain in shell history. Its code expires and
can be used once; after successful enrollment it no longer works. It is shown
only at creation. **Activity → Setup codes** lets an Admin cancel an unused code; create a new
one if the original was lost. See [agent installation](../operating/agents.md) for
supported hosts, custom installation locations and prerequisites.

A server has a permanent ID, separate from its hostname and display name. Renaming
it, changing its IP or rotating its agent credential keeps the same stored history.
A new enrollment creates a new ID; matching a hostname never merges identities.

## Find and organize servers

The groups sidebar shows All servers, Ungrouped and Fleet groups. A server can
belong to several groups. **Manage groups** creates, renames and deletes groups;
deleting a group leaves its servers and their data intact. Fleet groups organize
the inventory. They are separate from the permission groups in Settings → Users &
groups and do not grant access.

**Manage groups** opens an alphabetical table of all groups, their descriptions and
server counts. Choose **Edit group** beside a row or **Create group** above the
table. The form opens in the same dialog. **Save** returns to the refreshed list;
**Cancel** or **← Groups** discards the draft and restores your list position.
**Delete group** is available in the edit form and requires confirmation. Its
servers and their data stay in the Fleet. There is no search or group selector in
this management dialog.

Search matches display names, reported hostnames and tags. Filters narrow health,
connection, maintenance, tags, operating system and agent version. Active is the
default tab. All includes paused servers and, for Admins, archived servers. Counts
and choices follow your access; unavailable servers are not revealed by a count.

Open **Manage server** beside a row to edit its display name, description, owner
notes, groups or tags. Only Admins see owner notes. Names are limited to 100
characters, descriptions/notes to 2000, group names and tags to 64. Each server may
have up to 100 group memberships and 20 tags; tags are normalized to lowercase.

Select rows to change groups/tags, schedule maintenance, pause/resume or remove
several servers. Selection persists across pages in the same filter scope and is
limited to 100 explicit servers. Changing filters clears it. There is no implicit
“all matching servers” action. Each target is checked separately; Operation shows
successes, conflicts and failures. Refresh and select a changed server again.
Retry an uncertain request to complete the same operation, rather than starting a
second action. Recent operations are available under Activity → Operations. Unfinished only finds pending work and
failed cleanup, including older operations; page controls keep all records reachable.
Any current Admin can inspect progress and explicitly resume unfinished work.
Completed removals do not prevent the remaining servers from being processed. If
a server or the retention policy changes meanwhile, review it again and start a
new confirmed operation for the affected servers.

## Understand status

Pausing and resuming keeps compatible skill memory, including previously observed
maintenance results, within your data retention. After resuming, health stays
Unknown until the server sends fresh readings. A remembered result is historical
information; it does not confirm work happened during the pause. A pending check
may still need attention after monitoring resumes.

| Indication | Meaning |
| --- | --- |
| Active | Collection is allowed; current health still depends on fresh check evidence |
| Paused | Collection is blocked; heartbeats and agent updates remain available |
| Pause pending / Resume pending | The app changed its policy and is waiting for the agent acknowledgement |
| Archived | Agent credentials are revoked; retained data/settings stay with the original ID |
| Deleting | Reconnection is fenced and permanent cleanup is in progress |
| Online / Offline / Unknown | Separate connection evidence, independent of monitoring health |
| Maintenance | Collection continues while health and connection notifications are suppressed |

Pause requires an agent that has negotiated monitoring control. Update an older
agent first. An offline supported agent may remain Pause pending until it connects.
The app blocks new authoritative collection immediately; it does not pretend the
remote process has stopped before acknowledgement. Resume requires fresh readings,
so the previous result is not automatically treated as current health.

## Maintenance

Choose Schedule maintenance to start now or at a future time, with an end or until
ended manually. Monitoring readings and sampled History continue. Health and
connection notifications are suppressed for the window. End maintenance cancels
an upcoming window or ends a current one. The next fresh post-window evidence
establishes notification state; suppressed intermediate changes are not replayed
as a burst. An already transmitting email cannot be recalled.

## Remove, restore or reconnect

**Remove servers** offers two distinct choices:

- **Remove and keep data** archives the server, revokes its agent credential and
  targeted setup codes, and retains settings/history under the normal retention
  policy. It disappears from current Dashboard attention. Admins can find it under
  Archived and choose Restore server.
- **Remove and delete data** permanently fences the identity, revokes credentials
  and queues deletion of all owned data. Review the selected IDs and acknowledge
  the irreversible deletion. Operation shows queued/running/completed progress and
  a retry action if cleanup fails. Queued does not mean deleted.

Restore issues a code explicitly bound to the archived ID. On an existing managed
installation, use the displayed `reconnect` command and paste the new code. It
checks the app and server identity before changing credentials. For a clean
reinstallation, run the normal installer with the restore code; its enrollment
continues the same retained history. A current agent supporting the new management
commands is required. Use `--install-dir` for a nondefault managed location.

Reconnect agent on a live server similarly rotates its credential without creating
a new history. If a replacement response is interrupted, the agent resumes its
saved replacement request; keep its state directory. Never delete state to retry.
A code for another server is rejected by the managed reconnect command.

Permanent deletion cannot be restored through an old credential or code. A later
new enrollment on that machine gets a new ID and history. Only minimal opaque
administrative deletion receipts remain. Shared skills, packages, users, permission
groups and other servers are preserved. External database backups follow your
separate backup policy; see [recovery](../operating/backups-and-recovery.md).

## Retention

Settings → **Data** controls retained monitoring data for all servers. The default
is **90 days**, configurable from **1 to 3650 whole days**. Reducing it immediately
hides newly expired data and queues bounded cleanup. Increasing it does not restore
expired data. Configuration, identity and required replay authority are separate
from monitoring detail. Custom chart/history windows may be up to 90 days per
request anywhere in the available retained range.

See [Fleet contracts](../reference/fleet-management.md),
[data lifecycle](../reference/data-lifecycle.md) and [History](history.md).
