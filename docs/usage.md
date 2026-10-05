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
