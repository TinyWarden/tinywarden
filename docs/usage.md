# Using TinyWarden

TinyWarden observes servers through an outbound HTTPS agent. It does not execute
repairs. A local administrator signs in with the `admin` username and chosen password;
there is no account registration or email password-reset flow.

## Servers

The dashboard groups servers into Critical, Warning, Unknown or stale, and Healthy.
The attention count and color follow the highest current severity. The navigation
badge, browser title and favicon retain that count across authenticated sections.
A stale connection and an unknown skill result are separate conditions: check the
server's last contact and the individual skill explanation.

The changes panel appears when observations changed in the last 24 hours. Its
"Since midnight" count uses Europe/Bucharest midnight. History
contains sampled state changes; it is not a complete log of host actions.

Select a server to inspect contact, collected facts, current skill results and
reading history, or edit that server's settings. Enrollment, agent replacement and
revocation are administrative actions. Revocation stops further authenticated
contact; it does not remove the agent from the remote host.

## Skills

Only Debian 13 is currently verified. Each skill reports independently on its own
schedule. An agent heartbeat does not mean every skill just ran.

| Skill | What it observes | Important limit |
| --- | --- | --- |
| Disk usage | Used capacity for local filesystems visible to the agent | Missing or incomplete coverage cannot establish health. |
| Package updates | A local APT update-plan simulation | A clean result passes only that local check; it does not refresh package indexes or establish that the host is fully patched. |
| Reboot required | The local package reboot marker | An absent marker passes this limited check, not every possible reboot condition. |
| Filesystem trim | `fstrim.service` execution and timer evidence | Scheduled waiting is distinct from failed, missing or overdue execution; a weekly timer does not by itself make the server stale. |

Skills settings contain the global On/Off switches and shared defaults. Global Off
stops new scheduled runs and removes that skill from current attention; earlier
readings remain historical. Re-enabling requires fresh current evidence.

Use **Add skill** in the sidebar to upload a ZIP. A new skill starts off.
**Official** identifies trusted TinyWarden packages; other uploads are **Community**,
regardless of the publisher name they declare. Review **Access to your server**
before enabling a skill. **Technical details** contains its verification fingerprint.

For updates, upload the new ZIP using **Add skill**, review its access in the same
dialog and confirm **Update skill**. The active version changes immediately after
confirmation. Compatible defaults, server overrides and the On/Off state are kept;
agents receive it on their next connection. Closing the review leaves the current
version active. An unconfirmed update can be resumed by uploading the same ZIP.

Per-server edits preserve only the fields you customize. Fields left at default
follow future global changes. A custom value equal to today's default is still
custom until you reset it. Returning to global defaults clears the overrides.
Settings revisions identify saved policy/snapshot versions internally; there is
no settings rollback interface.

## History and email

History supports server and skill filters and time/state filters. Reading details
and observed transitions have a 90-day online window. Older details are deleted by
the optional cleanup job; backup retention is an installation choice.

Optional email sends warning/critical skill problems, offline-host notices and
recoveries once per observed state transition. It uses one configured recipient.
The message records the sampled state and links to the server. Delivery can be
uncertain; TinyWarden does not automatically resend an uncertain attempt.

See [operations](operations/runbook.md) for service checks and safe recovery.

## Skill displays and graphs

Server skills can show readable facts, tables, usage bars and history charts. Open
a chart section and choose its time range; disk history lets you choose a mount.
The displayed values describe sampled evidence, not a live reading. Gaps remain
visible, and charts begin with readings received after the package version was
installed. Old versions keep their original settings and facts in reading history.

The public `/playbook` page demonstrates the shared visual components with sample
data. Skill authors use the [Display API](architecture/skill-display.md), never
uploaded HTML or CSS.

## Collect a reading now

Use **Run now** beside a skill's **Settings** button on a server page. Queued,
Running and Completed/Failed show its progress, including after reloading the page.
A completed reading can still report an issue. This collects information; it does
not install packages, trim disks or fix the reported condition. Scheduled checks
continue independently. Update an older agent if the button asks for an agent update.

### Reading a skill card

Current results and graphs appear first. **Details** holds supporting facts;
**History** is the final, initially closed collection log. It shows ten entries
per page with Time, Result and an issue note when needed. Choose 24 hours, 7, 30
or 90 days using the same controls in every skill's History; graph controls
stay synchronized with that window. Opening History freezes the
window while you browse; Refresh picks up the latest known server time. Closing
History resumes the rolling graph. Live status and Run now keep updating.

Online means the app recently accepted communication from the agent, such as a
heartbeat, skill poll or result. Each skill's freshness and health is separate.
If contact interruptions recur, inspect the agent journal's heartbeat diagnostics
and the app/database/proxy logs; contact loss can also mean that the app was
unreachable. Diagnostics report categories and retry timing without credentials.

### Navigate skill History

Expand the last History section of a server skill to see ten compact collections
per page. Use the numbered controls or Go to page to reach older rows directly.
Custom sets From/To for both graphs and History; fields show the app's timezone.
Remove the Range chip to return to the last preset. Jump to time selects the nearest
retained collection and highlights it. Refresh includes newer arrivals while
ordinary current results and agent contact continue updating. Retention is 90 days.
