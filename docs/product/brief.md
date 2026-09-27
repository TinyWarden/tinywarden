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
The current scaffold implements none of these product records or workflows.
