# Build a TinyWarden skill

A skill is a standalone Python package that collects bounded observations and
returns typed health assessments. The platform owns scheduling, permissions,
isolation, delivery, presentation, history and notifications. A compatible new
skill needs no app or host-agent source change.

Start with [your first skill](quickstart.md), then follow the task you need:

| Task | Guide |
| --- | --- |
| Understand package files, schemas and immutable versions | [Package format](../reference/skills/package-format.md) |
| Implement collection, reduction and evaluation | [Python SDK](../reference/skills/sdk.md) |
| Read supported host data | [Host access](../reference/skills/host-access.md) |
| Discover and select separate monitored targets | [Resource skills](resources.md) |
| Add server widgets, graphs and dashboard fields | [Display reference](../reference/skills/display.md) |
| Add a notification Details paragraph | [Notification Details](../reference/skills/notifications.md) |
| Test captured observations and real collection | [Testing](testing.md) |
| Distribute and update a package | [Publishing](publishing.md) |
| Diagnose authoring failures | [Troubleshooting](troubleshooting.md) |

Use SDK 1 for one assessment scope per skill/server. Use SDK 2 when users select
individual resources on each server and need independent incidents. Both use
Python 3.13; check [compatibility](../reference/skills/compatibility.md) before
choosing newer descriptor or host-operation features.

Skills are read-only observers. A request to add a new host capability belongs in
the SDK/platform contract; declaring metadata cannot create that capability.
