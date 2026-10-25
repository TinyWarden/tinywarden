# Monitoring skills

Administrators use **Skills** for global enablement and default settings, and
**Manage skills** for repository browsing, installation, update reviews and ZIP
upload. A newly installed skill starts disabled. Review **Access to your server**
for that exact version before enabling it. Official identifies verified publishing
origin; every package still needs appropriate host access and runtime support.

## Install, update and configure

Add repository URLs in **Settings → Skill repositories**, then browse packages in
Manage skills. Check for updates is manual. Upload skill accepts a prepared ZIP;
it does not run package installation hooks. An uploaded update is not active until
you confirm its review. Closing the review keeps the current selected version.

Compatible updates preserve defaults, per-field server override intent, enablement
and retained history. Every selected digest needs access review. Incompatible
settings schemas are rejected rather than silently migrated. Agents receive new
assignments on their next connection.

Global Off stops new scheduled runs and removes the skill from current attention;
retained readings remain historical. Re-enabling needs fresh evidence. Server fields
left at default follow later global changes; custom fields remain custom even when
their current value happens to equal the global default.

## Disk space

Measures used capacity on supported local filesystems visible to the agent. Default
warning/critical thresholds are 85%/95%, checked every five minutes. The fullest
writable filesystem drives attention; detailed rows explain mounts and coverage.
It does not check inodes, quotas or network filesystem health. Missing/incomplete
coverage cannot prove healthy capacity.

## Filesystem trim

Observes the fstrim timer and completed service result. It distinguishes scheduled
waiting, failure, missing evidence and overdue execution. Completion evidence can
survive reboot, so a weekly schedule does not require a new trim on every hourly
check. Reported success does not prove that physical device space was reclaimed.
The skill never runs trim.

## Package updates

Its monitor simulates APT's pending plan from locally cached package lists. It
reports upgrade, new-package, removal and held-back information where supported.
Monitoring does not refresh
package indexes, install packages or independently establish repository freshness
or security-patch coverage. Incomplete/failed evidence stays explicit. Counts and
available row/version information must be read with any completeness explanation.

Updates 1.2.6 also supplies separately authorized **Refresh package lists** and
**Conservative upgrade** actions. See [package maintenance](package-maintenance.md)
for compatible agents, permissions and plan approval. Monitoring remains available
without permission to run either action.

## Reboot status

Checks the package reboot-required marker. A present marker raises a warning; an
absent marker passes only that limited check. Dashboard Reboot request is Yes/No.
No is healthy for this observation, not a guarantee that no software or kernel
condition could benefit from a reboot. The skill does not reboot the server.

## Services

Monitors explicitly selected continuous systemd services on each server. Enable it,
open the server's Services settings, refresh discovery if necessary, select targets
and Save. Initial selection is empty; discovery never selects everything automatically.
It needs a resource-capable app and managed agent 0.0.11 or later.

Only eligible continuous services can be newly selected. Oneshot, RemainAfterExit,
bare templates and socket/timer/path-activated units have explanations. Loaded
instances and canonical unit identities are handled separately. Missing selected
services remain selected until removed.

Defaults are 60-second checks, 60-second unhealthy confirmation and 120-second boot
grace. Positive confirmation delay needs two distinct fresh observations. A selected
stopped, failed, missing or masked service can become critical after confirmation.
Running/reloading can recover independently; unreadable, unsupported or expired
evidence is unknown. Transient startup/restart states are evaluated with the same
confirmation rules. Zero delay permits first-observation failure after boot grace.

Removing a target ends monitoring without a recovery claim. Adding another target
preserves existing incidents. Global defaults and reset do not select targets for
other servers. Discovery caps at 512 entries and selection at 64; selected targets
are read independently of partial discovery. State is sampled: short stops may be
missed. Running is not an application response check. No service-control or log
access is granted.

To create another monitoring package, use [Build skills](../build-skills/README.md).
Package-local READMEs describe their immutable release; this guide describes current
application workflows and support.
