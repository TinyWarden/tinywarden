# Backups and recovery

Online observation/event retention defaults to 90 days and is configurable in
Settings → Data; backup retention is an installation
choice. A database backup alone does not preserve environment files, package content,
trusted runtime/job artifacts, TLS configuration or remote agent state. Cover these
separately with restricted access and record compatible source revisions.

## Create and inspect a database backup

Run PostgreSQL 18 tools as the configured `tinywarden` database login using protected
connection configuration. Verify the connected database and owner first. Use a new
private location outside the checkout:

```sh
pg_dump --format=custom --dbname tinywarden --file /absolute/private-backups/database.dump
pg_restore --list /absolute/private-backups/database.dump
```

The selected database must match the intended owned target. Keep directories mode
0700 and credential/dump files mode 0600. Record backup time and application schema.
A readable table-of-contents is necessary but does not prove a usable restore.

## Rehearse on a disposable target

Choose a new owned disposable database on the existing PostgreSQL instance,
restrict PUBLIC connections and retain archive ACLs. Restore with
`pg_restore --single-transaction --exit-on-error --no-owner` into that target,
never over the serving database for a rehearsal. Verify migration ledger, counts,
constraints, permissions and representative authorization/receipt relationships.
Use synthetic authority checks where needed; row counts alone do not prove usable
credentials. Remove only rehearsal resources created for the exercise.

A populated rehearsal is required when destructive/recovery behavior or restore
tooling/target changes, or matching recovery evidence is absent. Routine compatible
additive upgrades do not require repeating unchanged full rehearsals.

## Restore an installation

1. Select the backup point and account for the lost gap, including newer observations,
   settings, grants and revocations. Pause/drain jobs and stop web first.
2. Restore the explicitly selected owned database with compatible application/runtime
   artifacts and package content. Verify ledger, constraints, authority and ownership.
3. Reconcile newer revocations, account/password/grant changes and agent credential
   generations across the lost gap. Invalidate restored operator sessions before
   reopening web access. Preserve remote agent durable counters; never lower them,
   delete queues or casually reuse restored authority.
4. Reset history continuity and retire the restored notification epoch before any
   capture/delivery timer resumes. Keep sending disabled during this step.
5. Clear restored account email tokens/jobs while account mail is paused; backed-up
   bearer links and queued mail must not be reactivated.
6. Verify fresh current contact/evidence and authenticated app access, then resume
   only intended compatible jobs. Document the unrecoverable interval.

Guarded continuity commands use the exact owned database and private environment:

```sh
node --env-file=.env.production.local --import tsx scripts/history.ts reset --expected-database tinywarden
node --env-file=.env.production.local --env-file=.env.notifications.local --import tsx \
  scripts/notifications.ts configure --expected-database tinywarden --rotate
```

Keep monitoring transport disabled while retiring restored routing. Account cleanup
is an explicit owned-database operation against `tinywarden.account_email_tokens`
and `tinywarden.account_email_jobs`, performed only after confirming the restore
target. Do not drain restored mail queues. A backup cannot undo SMTP submissions.

Missing/regressed assignments retain their recovery safeguards. Already acknowledged
agent results are not guaranteed to be retransmitted. There is no destructive down
migration or silent resurrection of expired readings. After physical retention,
pre-retention code is not a valid rollback because it ignores compact retry receipts.
