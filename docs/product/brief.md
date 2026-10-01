# Product brief

TinyWarden helps operators understand which Linux servers and VMs need attention,
why, and eventually which authorized maintenance actions have happened. It is
open source and self-hosted. Core operation requires no hosted account or Proxmox.

The primary workflow is: deploy a control plane, enroll a host with a one-time
token, receive outbound heartbeats, inspect current/stale state, assign centrally
versioned checks, and inspect current outcomes and history. The server interprets
results. Missing evidence produces unknown or stale state, never healthy state.

The first usable release covers disk capacity, package updates, reboot-required
signals and an extensible operational check such as fstrim status for a tested
Linux distribution. A central recipe or threshold change reaches an enrolled
agent without a new binary when its existing capabilities suffice.

Release acceptance: a new operator follows the deployment guide, enrolls several
supported hosts, sees trustworthy status, changes a supported definition centrally,
and restores the system from a documented backup. The earlier first connected-host
milestone requires enrollment, persistence across restart and stale-state detection.

First-release exclusions: free-form scripts, privileged remote actions, complex
roles, large-scale analytics, required Proxmox integration and native mobile apps.
Notifications, retention and backup are addressed before release; privileged
maintenance and optional providers require later adoption decisions.

Terms: a **host** is the stable managed inventory identity; an **agent** is its
outbound client; a **definition** is a versioned check recipe and interpretation;
an **observation** is execution evidence; **health** is a server-derived result.
P1 targets Debian 13 agents, one local administrator and a public HTTPS origin.
Its current/stale labels describe contact only; health remains unknown until checks
provide evidence. See the [P1 protocol](../architecture/agent-protocol.md).
P1.B implemented operator access and enrollment. P1.C added the Go client,
heartbeat and guarded fleet status, including a disposable Debian 13 VM test. P1.D
added credential replacement, revocation and recovery; its final review completed.
The first live control plane and Debian 13 VM agent run accepted P2 disk and P3
package/reboot/fstrim observations. Local integration, phase checks, final review
and the separately authorized [live upgrade](../development/p3-acceptance.md#live-deployment-acceptance)
passed on 2026-09-30. Their [execution](../architecture/recipe-execution.md) and
[evidence](../architecture/baseline-observations.md) contracts define the accepted scope.

P2 owner requirements selected 2026-09-29: the first disk check covers every local
filesystem on a supported host. Its initial global defaults are warning at 85% used,
critical at 95% used, and collection every five minutes. Per-host overrides are in
scope; group rules are deferred. Hosts inheriting the global default receive later
default changes, while explicit host overrides keep their chosen values. Definition
revisions must preserve the meaning of historical observations. Exact filesystem
applicability and revision/delivery rules belong to the P2.A contract.
