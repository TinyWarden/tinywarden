# Server details

Open a server from Dashboard or Fleet at `/fleet/{id}`. The page shows contact, host facts,
agent version and each enabled skill independently. Last contact means recently
accepted communication; it does not mean every skill ran at that time.

Lifecycle and maintenance context are separate from the last skill result.
**Manage in Fleet** opens the matching inventory row. Use [Fleet](fleet.md) to
pause collection, schedule maintenance, remove/restore a server or delete its data.
An archived server is visible only to Admins; deletion removes ordinary detail access.

## Inspect a skill

The current result explains the check and its evidence. Current summary sections
come before resource rows and supporting Details. Graphs show retained numerical
observations with visible gaps. **History** is the final collapsed collection log,
with ten entries per page. A completed collection can still report a problem.

History and graphs share a time range: 24 hours, 7, 30 or 90 days, or a custom range.
Opening History pins that window while browsing. Refresh includes new arrivals;
closing it resumes rolling graph bounds. Current status and contact continue to
update independently. Jump to time selects the nearest retained collection. Old
readings preserve their original package/settings context.

## Collect now

Administrators can use **Check now** beside Settings when the host runtime supports
it. **Waiting for agent** changes to **Checking…** when the agent claims the
request; completion clears the waiting message and enables Check now again. The
card reads progress every two seconds while waiting/checking and the tab is visible.
Refresh
resources uses the same mechanism. It does not start/stop services, install updates,
run trim or repair a condition. Scheduled collection continues separately.

A failed request needs its displayed explanation checked; repeated page refreshes
are not repeated collection commands. Older agents may require an update before
manual collection is available.

Agent 0.0.27 and a matching app can wake monitoring promptly instead of waiting
for its normal discovery interval. A requested check runs before other scheduled
checks once the current collection finishes. Offline agents, an occupied runtime,
queued results or a server-directed cooldown can still delay it. Repeated clicks
join the same pending request. A stale reading keeps its original timestamp until
a fresh result arrives; waiting never makes old evidence current.

## Run a skill action

Available actions appear in each skill's **Operations** dropdown beside **Check now**
and **Settings**. These come from the
installed skill version and require separate administrator permission and fresh
host readiness. Every menu choice applies only to the server you are viewing.
If a background availability read fails, opening **Operations** retries that read.
If the read still fails, use **Retry loading actions** in the menu. This only
checks availability; it does not start an operation. Dismissing a saved result
never removes eligible actions.
If the server confirms that no actions can currently run, the menu explains why
and provides **Check action availability**. A running operation retains its own
progress or verification link.

For **Package updates**, use **Refresh package lists** to refresh APT indexes and
read available changes, or **Upgrade packages** to prepare an upgrade plan.
Refresh starts immediately; an upgrade still requires approval of the exact plan
before installation. **Check now** collects monitoring evidence and does not
refresh APT indexes or install packages. See [package maintenance](package-maintenance.md).

Actions with settings open their input form first. While work runs, its skill
section shows the operation and **View progress**. Closing the dialog keeps the
operation running; use View progress to reopen it, including after reloading the
page. Once work finishes, the receipt shows its outcome and completion time with
**View result**. A plan waiting for approval offers **Review plan**. An uncertain
outcome keeps **Verify and unlock**, rather than appearing completed.

Use the **×** beside View result to **Dismiss result notice** after reviewing a
finished operation. This hides only that exact notice for your account across
devices, including after a refresh; a new or changed result appears again. It does
not delete the result. Running work, plans awaiting approval and outcomes that still
need verification cannot be dismissed. Use Recent results to open a dismissed result.

The latest operation is loaded from saved records, so refreshing or leaving the
page does not remove access. Use **Operations → Recent results** for earlier
operations on this server and skill. This remains available when starting a new
action is unavailable. Opening a result does not execute it again; a result from a
bulk operation opens only this server's job. Results and logs remain available
while retained under the configured retention policy; Fleet Activity also keeps
access to retained operations. Conflicting or unavailable commands are omitted.
The same controls work for other action-capable skills without special app or
agent integration.

## Configure a server

Customize individual scalar fields in a skill's Settings. Untouched fields continue
following global defaults. A customized value equal to today's default remains an
override until reset. **Use global defaults** clears scalar overrides; resource
selection remains specific to that server. Save applies the draft; filters and
search alone never change monitoring.

For Services, select continuous services that should remain running. Use **Show all
states** to inspect unsupported/unavailable entries, **Monitored only** for selected
items and the state quick selector to focus the list. Selected missing targets
remain visible for review. Read [Services](skills.md#services) for confirmation and
boot-grace behavior.

Agent update settings are separate from skill settings. Replacement/revocation
changes agent authority; it is not remote software removal. Use the managed host
commands for [agent maintenance](../operating/agents.md).

The skill list, summary counts and jump menu use installed package results. A server
with no installed skills shows an empty list.
