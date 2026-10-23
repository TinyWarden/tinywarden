# Install and maintain host agents

In the app choose **Add server**, enter a name and obtain a setup code. Follow the
[host-agent installation guide](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/deploy/native.md)
on its supported Debian 13 amd64 host. Download the official installer completely
before executing it. The code contains a single-use enrollment credential; keep it
out of arguments/logs. Installation creates a dedicated non-root monitoring account.

The managed default base is `/opt/tinywarden-agent`; config, current release,
private data and updater recovery material live there. Its root-owned update
process is separate from unprivileged skill execution. Host prerequisites are
explicit; the installer checks for Debian 13 amd64 before suggesting packages and
lists only missing prerequisites in its `apt install` command. Debian 13's `python3`
package supplies the required Python 3.13 runtime. Install the suggested packages
yourself, then rerun the installer; it does not install OS packages automatically.

## Updates

App **Settings → Agents** controls the automatic-update default. Each server can
inherit or override it. A local root-owned prohibition wins. Automatic updates use
a daily randomized timer and require signed compatible stable releases plus fresh
app policy. Manual update still verifies signature/compatibility/downgrade rules.

For the default base:

```sh
sudo /opt/tinywarden-agent/current/tinywarden-agent check
sudo /opt/tinywarden-agent/current/tinywarden-agent update
sudo /opt/tinywarden-agent/current/tinywarden-agent auto-updates off
sudo /opt/tinywarden-agent/current/tinywarden-agent auto-updates on
```

Use the same `--install-dir` for a custom base. Download/validation precede stopping
monitoring. The executable and trusted runtime switch together. Identity,
credentials, generation, counters, queues and skills are preserved. Installed,
awaiting confirmation needs the actual new agent's report; download success alone
is not installation confirmation.

## Failure, replacement and removal

Inspect maintenance status, the agent service result and bounded journal output.
Use `repair` for an interrupted managed installation/update with its recorded
verified target. Preserve uncertain state; do not delete identity or queues or
lower counters to make recovery appear successful.

An app-side credential replacement/revocation affects accepted contact. It does
not uninstall the remote agent. The managed `--uninstall` prompt offers stop/disable
with data retained or an explicit purge. App server records/history remain separate.
Ordinary package updates happen through skill delivery and need no agent binary
change when the installed SDK supports them.

## Fleet control and reconnection

[Fleet](../using/fleet.md) owns server organization, maintenance, pause/archive and
explicit restore. Pause requires negotiated monitoring control; heartbeat and
updates remain enabled. Ship the compatible app/schema before the agent upgrade.
Source builds do not update signed installed agents automatically.

For an existing managed identity, create a targeted reconnect/restore code in Fleet
and run `sudo /opt/tinywarden-agent/current/tinywarden-agent reconnect`. Paste the
code at its hidden prompt. Add `--install-dir PATH` for a custom location, or
`--setup-code-file FILE` for a root-owned regular 0600 input. The command verifies
that the code belongs to this app and host before stopping the service. Interrupted
replacement resumes from its saved journal when the service restarts. Preserve
its state directory and use the ordinary recovery procedure if it cannot finish.
For a clean reinstallation, use the normal installer with the explicit restore
code. Permanent deletion cannot be restored that way.
