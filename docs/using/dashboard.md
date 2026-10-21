# Dashboard

Dashboard groups servers into **Needs attention**, **Unknown or stale**, and
**Healthy**. Each server shows its worst eligible current check result. Critical
and warning problems need attention; stale/unknown evidence is uncertainty, not a
successful check. Contact status describes agent communication separately.

Paused, archived and currently maintained servers are excluded from these health
groups. The management links above the groups open their filtered [Fleet
inventory](fleet.md); their absence from Dashboard is not a healthy result.

Open a server to inspect individual skills and reasons. Primary group/server
statuses use boxed chips; secondary row values use quieter text status. A problem
count or green value is not a substitute for the underlying check's explanation.

## Choose information

**Customize dashboard** selects optional server facts and skill fields, up to 32
optional columns. Server identity/contact/health remain visible. Choices belong to
the signed-in user and survive reload and compatible updates. A skill can offer
fields; the platform also offers its aggregate **{skill name} health**, including
Services. This summary does not list individual resources.

Values adapt to the selected columns. Filesystem values show usage and its mount
context. Reboot request uses Yes/No; its current assessment supplies the color
(healthy No is green, warning Yes amber). Time values use the displayed timezone,
a compact 24-hour form and a full timestamp in their accessible description/tooltip.
Missing or expired data does not become zero, No or Healthy.

Desktop tables align the first column left, interior columns center and last column
right. Headings may wrap. Wide tables scroll inside their container; mobile layouts
retain labels. Column selection never changes monitoring, history or alerts.

## What changed today

The changes sidebar shows eligible observed transitions since midnight in the app's
displayed timezone. **Show today's changes** controls its visibility. Hiding it
keeps capture and the full [History page](history.md) active. It is sampled history;
short changes between observations can be missed. Check any lag/coverage notice
before interpreting an empty list as no observed change.
