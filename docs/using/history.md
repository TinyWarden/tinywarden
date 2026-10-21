# History and notifications

History shows sampled changes in contact and configured checks. It is not a full
host action log and cannot reconstruct transitions between samples or during a
capture gap. Use server/skill/resource, state and time filters to narrow events.
Open Details for the recorded evidence and package context.

Online details and events follow Settings → Data retention (90 days by default). Older details are filtered even
when physical cleanup has not run. A new baseline or gap means continuity was not
established; it is not a recovery event. Historical health cannot restore current
contact or clear a current problem. Dashboard's changes panel is a shortcut to the
same observed history, limited to the current day.

## Monitoring email

An operator can enable monitoring email for observed warning/critical problems,
offline hosts and eligible recoveries. The configured route has one recipient;
account profile emails do not create subscriptions. Services incidents identify
the server and target independently.

A notification describes sampled evidence. An SMTP relay accepting a message does
not prove inbox delivery. Submission can be uncertain, and an uncertain attempt is
not automatically resent. Operators inspect and acknowledge uncertainty without
claiming delivery or replaying the message. Unknown/stale evidence is not proof of
recovery. [Mail configuration and operations](../operating/jobs-and-email.md) cover
activation, paused routes and recovery.

Collection History inside a server skill records readings rather than only state
transitions. Graphs derive numerical samples from accepted evidence; gaps and
compatible-version context remain visible. See [server details](servers.md).
