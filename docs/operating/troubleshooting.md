# Troubleshoot an installation

Start with the affected layer and one current observation. Preserve credentials,
identity, counters and queues. Avoid unrestricted environment/state dumps in logs.

| Symptom | Inspect |
| --- | --- |
| App unavailable | `tinywarden.service`, listener/proxy, private config and database readiness |
| Login mutation rejected | Exact HTTPS origin, cookie/session, enabled account, current sign-in mode and rate limit |
| OIDC fails | Exact issuer/discovery, same-origin endpoints, trusted TLS, client secret, callback URI and one active browser ceremony |
| OIDC User sees no servers | Provider admission succeeded; add appropriate direct/manual/provider-group server grants |
| Local User cannot password-sign-in | OIDC mode requires provider sign-in; only local Admin fallback is allowed |
| Server offline/stale | Host agent service/journal, destination HTTPS origin/TLS, last accepted communication and durable retry state |
| Contact online but skill unknown | Skill enablement/access/runtime support, delivered settings and its own fresh collection |
| Services Not configured | Choose per-server targets; global enablement does not select them |
| Missing selectable service | Show all states, inspect eligibility/completeness, canonical identities and selected missing targets |
| Run now fails or waits | Agent feature support, service/queue/runtime diagnostics and bounded progress result; repeated page refresh is not collection |
| Chart gaps | Retained accepted samples, context/freshness breaks, chosen series/range and compatible definitions |
| History appears empty | Filters, visible server grants, capture job coverage and retention |
| Mail absent | Selected transport, worker completion, valid verified mailbox/route, throttling and failed/uncertain outcomes |
| Skill action absent | Selected package/version, exact action permission, verified origin, compatible recognized agent, local publisher/class policy, declared prerequisites and conflicting work. Use Agent settings → Maintenance actions for readiness; [Package updates](../using/package-maintenance.md#before-you-start) has its own requirements. |
| Upgrade awaiting approval | Complete prepared plan, fresh baseline coverage and 30 minute plan expiry |
| Action dialog closed or conflicting menu choices missing | Reopen View progress beside the server or in Manage server. Saved results are under Activity → Operations → Details. Closing never cancels an action. |
| Action fails without enough detail | Expand **Operation log** in the saved result and use **Copy details**. Compatible agents/skills report catalogue messages and safe runtime codes; older work may have only saved platform stages. Log timestamps are receipt times and delivery is best effort. Do not infer an installation attempt or successful result from a log entry. |
| Package job Needs attention | Native process/locks, retained receipt and the [read-only recovery procedure](agents.md#package-maintenance-and-read-only-recovery); do not replay or delete state |
| Update awaiting confirmation | Actual agent version/runtime report and retained updater recovery state |

Useful app checks:

```sh
systemctl --user status tinywarden.service
journalctl --user -u tinywarden.service -n 100 --no-pager
systemctl --user list-timers 'tinywarden-*'
```

A timer waiting or process active is not proof of completed work. Review safe job
outcomes and latest successful scan/check times. An uncertain SMTP attempt must not
be resent automatically. For recovery follow [backups and continuity](backups-and-recovery.md).
For local password recovery without usable verified mail, an authorized operator
can run `node --env-file=.env.production.local --import tsx scripts/operator.ts reset-password`
in a terminal. It targets the original local account and changes no enabled state,
role or server grants; it cannot bypass a disabled/non-admin account policy.
