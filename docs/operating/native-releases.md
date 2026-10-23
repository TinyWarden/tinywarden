# Upgrade a native application installation

Use one selected serving checkout. Keep a verified source revision, private
configuration and new restricted backup directory. Upgrade only changed components;
ordinary documentation changes do not require restarting the app.

## Select the scope

| Change | Required work |
| --- | --- |
| Documentation | Check guides/links; preserve package-bound file identities |
| Web/server behavior | Verify source, build web and perform authenticated smoke |
| Schema | Readable custom dump, one forward migration, exact ledger/readback |
| Dependency lock/install | Include dependencies with web; install exact build dependencies |
| Job/shared contracts | Build and pin compatible immutable jobs and runtime assets |
| Host-agent platform | Separate agent release/upgrade; not part of the app tool |

Do not rerun unchanged installs, migrations or deployments to repair a failed
readback. Recovery-contract/destructive changes require matching populated recovery
proof. A compatible additive migration can use the established backup/readback
checks when recovery behavior has not changed.

## Snapshot and plan

Stage reviewed path additions/removals. The snapshot records the exact Git tree and
runtime file hashes while preserving the real index/history. Choose new absolute
paths. These examples use operator-selected locations:

```sh
node scripts/native-release.mjs snapshot --output /absolute/private-backups/source.json
```

Read `sourceTree` from that JSON, then build its matching job artifact:

```sh
node scripts/build-native-jobs.mjs SOURCE_TREE /absolute/checkout/dist/native-jobs/SOURCE_TREE
node scripts/native-release.mjs plan --release /absolute/private-backups/source.json \
  --scope web --expected-database tinywarden \
  --jobs /absolute/checkout/dist/native-jobs/SOURCE_TREE
```

Replace SOURCE_TREE and paths with actual values. `plan` performs read-only checks
of source, private environment, database/role/ownership and service checkout. It
checks PostgreSQL 18 dump tools for schema scope and requires compatible jobs.
Scope is a comma-separated list of `web`, `schema` and `dependencies`. Use
`web,schema` when web and schema both change; `dependencies` requires `web`. Plan does not migrate,
build, change a service or send mail.

## Apply a verified release

Prepare a mode-0600 file containing a valid operator Cookie header for authenticated
smoke. It is a credential, not a whole HTTP response. Use a new absolute backup
path outside the checkout and only the selected scope:

```sh
node scripts/native-release.mjs apply --release /absolute/private-backups/source.json \
  --scope web --expected-database tinywarden \
  --backup /absolute/private-backups/release-unique \
  --cookie-file /absolute/private-backups/operator-cookie \
  --jobs /absolute/checkout/dist/native-jobs/SOURCE_TREE
```

Apply locks the checkout, pauses previously active project timers and drains jobs,
stops web and preserves affected artifacts/config. Schema scope dumps/checks the
backup, migrates once and verifies the ledger. Web scope builds and checks source.
Rendered unit copies and matching SDK/jobs are installed; authenticated smoke
precedes resuming only timers active before the change. New timers stay opt-in.
Remove the temporary cookie after use.

## Fleet lifecycle rollout

Deploy the compatible application, schema and jobs before the control-capable host
agent. Older agent transports remain supported; Fleet pause requires negotiated
`monitoring_control.v1` support. Verify a desired pause, its applied acknowledgement,
continued heartbeat and fresh post-resume evidence on a controlled server before
accepting the agent rollout. Archive/restore must retain the same host ID and rotate
credentials. A finished removal request is not proof that its purge job completed.

Before lifecycle or deletion changes, rehearse backup/restore with populated
synthetic data, including a pending purge, archived identity and retention watermark.
Keep traffic and jobs held while reconciling restored revocations, generations,
epochs and irreversible deletion/expiration decisions. Never restart older code
that ignores these fences against the changed database. Use forward repair or the
compatible [recovery procedure](backups-and-recovery.md); the
[Fleet reference](../reference/fleet-management.md) defines the invariants.

## Failure and recovery

Inspect the private release record's last step and service-manager state. A failed
step leaves timers paused and stops any attempted web start. Cleanup can be
unconfirmed; verify actual state. There is no automatic database restore, old-code
restart or repeated migration. An interrupted lock must be inspected before removal.

Forward repair, a proven-compatible code return and database restore are different
operations. Old artifacts are recovery material, not proof of compatibility with a
new schema or purged data. Follow [backup/recovery](backups-and-recovery.md), preserve
agent identities/counters and re-establish continuity before jobs resume.
