# History and notification state

History and notifications consume stored projections. Neither re-runs collection
or evaluation code during a read/delivery job. The same evidence/context rules
apply to cards, charts, sampled changes and alerts, but each consumer has its own
cursor and lifecycle.

## Sampled history

The periodic capture job observes contact and enabled skill subjects. A change
event records the observed transition and bounded facts with server acceptance
context. It cannot establish the exact moment a machine changed between samples.
Capture interruption, scope change and context reset create a new baseline rather
than inventing a continuous transition. Expired/unreadable evidence stays uncertain.

SDK 2 records selected-resource epochs independently. Bounded, rotating resource
scans prevent a large selection from permanently hiding later subjects. Removed
targets end their monitoring context; re-adding them starts a new epoch. The
dashboard's What changed today uses the selected display-timezone midnight window;
History is the full retained sampled view. Event/detail visibility remains scoped
to current server access.

Collection history lists actual retained readings and their stored assessments.
Metric history is a separate bounded numeric API with time/digest/series identity;
it must not fill missing coverage with zeros or extend a line through unknown time.
See [using History](../using/history.md) and [metric history](skills/metric-history.md).

## Transition and delivery are separate

A notification route maintains cursors, pending outbox events and attempt records.
A worker first samples eligible subjects, then claims an event under current scope
and route checks, sends outside the transaction and records its bounded outcome.
Message facts/catalogue/template context are captured immutably for that event;
later package updates cannot rewrite what an earlier observation meant.

Skill transitions use healthy/warning/critical; the separate contact subject can
also alert on offline. Unknown/stale skill evidence, contact loss, disabled or
changed scope cannot become a fabricated skill recovery. Recovery depends on an
earlier exposed unhealthy incident. Resource
removal cancels that context without a recovery claim. Compatible package changes
retain incident continuity only through the explicit continuation rules.

Pending events expire after 24 hours and are rechecked before delivery. A route
permits at most 30 attempt starts per hour. Explicit transient failures retry at
five then 30 minutes, up to three total attempts. Rejected delivery is terminal;
uncertain SMTP acceptance is recorded as uncertain and is not automatically resent.
An abandoned in-flight attempt must be reconciled through the operator procedure,
not made pending by deleting its attempt ID.

SMTP acceptance is not proof of inbox delivery. Account verification/reset email
uses a separate short-lived queue and recipient purpose; a verified account email
does not configure the monitoring route.

## Details and transport

Notification Details is optional typed JSON, not package-rendered HTML. Each field,
row and source is bounded and compiled using the original package catalogue.
See the [notification descriptor reference](skills/notifications.md), its
[schema](../architecture/skill-notification-details.schema.json), and
[jobs and email](../operating/jobs-and-email.md) for configuration/status commands.

Capture reset, database restore and route rotation need deliberate baseline and
delivery reconciliation. Use [backup/recovery](../operating/backups-and-recovery.md)
before restarting outbound work after a restore.

## Source

[History sampling](../../server/history/sampling.ts),
[transitions](../../server/history/transitions.ts),
[notification sampling](../../server/notifications/sampling.ts),
[dispatch](../../server/notifications/dispatch.ts) and
[notification message construction](../../server/notifications/message-v2.ts) own
these boundaries. Test interruptions, independent resource incidents, removal,
unknown intervals, retries and uncertain delivery alongside ordinary transitions.
