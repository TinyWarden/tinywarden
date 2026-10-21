# Build a resource skill

Use SDK 2 when every server has a different set of targets and users choose which
to monitor. One package can discover inventory, report eligibility and evaluate
selected targets independently. Services uses this for systemd units; the same
selection, history and UI work for another resource kind.

## Choose identities and discovery

Each collection has a stable name and a host-scoped selection field defaulting to
`[]`. Resource keys are opaque identities, not translated labels. Report label,
description, current display state, eligibility and any explanation for each item.
Newly discovered items are not automatically selected. Read selected targets even
when they are absent from bounded or partial discovery.

Keep discovery and health separate. An item may be visible but ineligible for new
selection. A previously selected item that disappears remains selected until the
user removes it. The absence of inventory is not proof that a selected target is
healthy or stopped. See the [exact SDK 2 shapes](../reference/skills/resources.md).

## Implement per-target outcomes

The collector returns package observation plus resource inventory. Reduction can
remember confirmation evidence per selected membership epoch. Evaluation returns
one subject for each selected target on every timeline entry. The engine computes
the overall status and routes independent target history/notifications.

Use `resource_epochs` and `evaluation_revision` to reset pending evidence when its
meaning changes. Adding an unrelated target preserves existing membership epochs.
Removing/readding the same key creates a new epoch; do not restore an earlier
incident under the new membership.

## Run a different resource kind

The [example deployment targets](examples/targets/README.md) package has two fixed
targets, alpha and beta. It declares no host capabilities and uses SDK 2 subject
outcomes. It is a runnable teaching example rather than a real deployment monitor.
Copy that directory to a fresh location outside the app checkout, then run:

```sh
python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" validate /absolute/example-targets
systemd-run --user --wait --pipe --collect \
  -p 'Delegate=cpu memory pids' -p DelegateSubgroup=supervisor \
  -p NoNewPrivileges=yes \
  /usr/bin/python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" \
  test /absolute/example-targets
```

Prepare `tw_sdk_root` as shown in [the first-skill tutorial](quickstart.md).
Expect three passing cases: no selection, independent healthy/critical targets,
and unknown when selected evidence is absent. Pack and collect use the same tools
as SDK 1. Adapting it to real inventory needs supported observation operations;
metadata alone cannot read new host data or add a capability.

## Services semantics

Services observes continuous system-manager services. It excludes new selection of
oneshot, RemainAfterExit, bare-template and socket/timer/path-activated units, with
explanations. Loaded instances have distinct canonical identities. Selected units
are read independently of discovery, including missing targets.

Defaults are a 60-second interval, 60-second unhealthy confirmation delay and
120-second boot grace. Positive delay requires two distinct fresh observations.
Unreadable, unsupported or expired evidence is unknown. Running is service state,
not an HTTP response check; short failures between samples can be missed. Read the
[user guide](../using/skills.md#services) before choosing alert semantics for a new
resource type.
