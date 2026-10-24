# Install and maintain host agents

In the app choose **Add server**, enter a name and obtain a setup code. Follow the
[host-agent installation guide](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/deploy/native.md)
on its supported Debian 13 amd64 host. Fleet's **Install on the server** command
includes the setup code and supplies it through standard input after downloading
the installer completely. Treat the copied command as private: it can remain in
shell history, although the code expires and can be used only once. The separate
**Setup code** box and manual hidden prompt remain available; use the guide's
command without `--setup-code-stdin` to enter it yourself. Agent 0.0.16 adds this
optional input; keep credentials out of process arguments and logs. Installation
creates a dedicated non-root monitoring account.

The managed default base is `/opt/tinywarden-agent`; config, current release,
private data and updater recovery material live there. Its root-owned update
process is separate from unprivileged skill execution. Host prerequisites are
explicit; the installer checks for Debian 13 amd64 before suggesting packages and
lists only missing prerequisites in its `apt install` command. Debian 13's `python3`
package supplies the required Python 3.13 runtime. Install the suggested packages
yourself, then rerun the installer; it does not install OS packages automatically.

## Updates

App **Settings → Agents** controls the automatic-update default. Each server can
inherit or override it. A local root-owned automatic-update prohibition wins for automatic work.
The root-owned updater checks Fleet requests about once a minute with jitter;
ordinary automatic release checks retain their 20-hour minimum interval.
Automatic updates require signed compatible stable releases plus fresh app policy.
Manual updates, including Fleet **Update now**, still verify signatures,
compatibility and downgrade rules. Turning automatic updates off does not block an
explicit Admin update request.

Use Fleet's server action or select servers and choose **More → Update now**.
Older agents need a manual server-side upgrade to gain this capability. Each
request pins a signed version and expires after 24 hours; offline servers stay
queued. Existing state and identity are preserved. See the
[update contract](../reference/agent-updates.md) for delivery and recovery details.

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


## Package maintenance and read-only recovery

Open the server's **Agent settings → Maintenance actions** to diagnose action
readiness. Read-only accounts use **Agent details** for servers they can access.
Fresh recognized reports list only missing packages: `apt` for the `apt-get`
command and `python3-apt` for Python APT bindings. Worker, catalogue, installation
and report problems have separate states; do not infer missing packages from them.
After a local prerequisite installation, wait for a fresh agent report.

Fleet package actions require a recognized managed maintenance-capable agent,
Debian 13 amd64, `apt-get` and `python3-apt`. Missing optional maintenance packages
do not disable monitoring or signed agent updates. Install prerequisites locally;
never grant a monitoring skill root package access. See the
[user workflow](../using/package-maintenance.md) and [contracts](../reference/maintenance-actions.md).

The managed installation owns a maintenance polling service/timer and a dedicated
root worker template. Bootstrap activates their complete signed set; an older
updater can install the release before its new poller registers the added units.
An administrator-disabled timer stays disabled after initialization. Ordinary
agent updates briefly stop/start the monitoring service and keep it enabled.
Package maintenance does not disable services. Maintainer scripts may restart them.
Rollback to an older release removes unsupported maintenance polling units only
when the common mutation fence proves no active worker. Uninstall also refuses
active/uncertain work; do not stop worker units or delete journals to bypass it.

For an attention result, inspect bounded service journals and the named receipt.
A running/stalled package process keeps its native locks; elapsed time is not
permission to kill it. Repair a partial package state locally under your host's
package-management procedures. TinyWarden does not execute automatic `dpkg`
repair or `apt --fix-broken` commands.

In **Activity → Operations**, open the job's **Read-only recovery**, confirm its
server and create an authorization. On that same server, for the default base:

```sh
sudo /opt/tinywarden-agent/current/tinywarden-agent maintenance --config /opt/tinywarden-agent/config.json --reconcile --authorization-prompt
```

Paste the code at the hidden prompt. For a custom base use its current executable
and config path. The CLI also accepts `--authorization-stdin` for a single code;
never put it in argv, logs or shared files. Before first acceptance an authorization
expires after 15 minutes and can be revoked or replaced by a current Admin. It binds
one saved job, revision and original installation scope; it cannot delegate that
job to a replacement agent generation.

After acceptance, rerun the same command without `--authorization-prompt` to resume
the private saved receipt. Acceptance, locked local integrity inspection and final
app receipt are distinct steps. The app keeps its fence until final delivery;
retries never repeat package installation. A pending outbox survives revocation of
the old agent credential and is not cleared by an app timeout. Keep its private
root state. Recovery preserves the historical failure and cancels remaining old
batch work. Prepare a fresh reviewed job only after reconciliation.
