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

Administrators can use **Run now** beside Settings when the host runtime supports
it. Queued, Running and Completed/Failed describe collection progress. Refresh
resources uses the same mechanism. It does not start/stop services, install updates,
run trim or repair a condition. Scheduled collection continues separately.

A failed request needs its displayed explanation checked; repeated page refreshes
are not repeated collection commands. Older agents may require an update before
manual collection is available.

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
