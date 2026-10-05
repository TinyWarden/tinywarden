# Native deployment and release

TinyWarden supports a native Node 24 application with PostgreSQL 18. The package
lives at the repository root. A deployment uses one working/serving checkout,
optional user systemd services and a public HTTPS reverse proxy. Configure the
checkout, origin, database, listener and port for your installation.

## Reusable services and local configuration

The seven files in deploy/systemd/ are optional community templates: the app
service and history, email and retention services/timers. They default to a
checkout at %h/tinywarden. scripts/install-native-services.mjs renders your actual
checkout into independent mode-0600 copies under ~/.config/systemd/user/ and
backs up the previous units. It does not start or enable anything. Repository
edits and moves do not silently alter installed service definitions.

Keep .env.production.local, .env.jobs.local and .env.notifications.local private
and ignored by Git. The app template defaults TW_BIND_HOST to 127.0.0.1; an
explicit value in .env.production.local selects another listener. PORT and
PUBLIC_ORIGIN belong to that same private configuration. Configure the HTTPS
proxy to reach the selected listener. User services that must start at boot and
survive logout require linger for the service account.

The app unit preserves the host user namespace so the Python runtime can verify
root ownership of system assets. Do not enable `PrivateTmp` on an unprivileged
user unit: its implicit user namespace can hide that ownership. Skill guests still
receive their own private namespaces and bounded temporary storage.

See [first installation](native-release.md#first-installation) and
[configuration](configuration.md).

## Direct-checkout change sequence

1. Identify which components changed and reuse acceptance for unchanged ones.
2. Record an exact source snapshot and prepare matching immutable job bundles.
3. Read the release plan before activation; select only required steps.
4. Pause previously active timers, drain bounded jobs and stop the app once.
5. Preserve affected artifacts/configuration. Dump/migrate only for schema changes;
   install dependencies only when the lockfile/installation changes.
6. Build the app if required, install rendered units and start the same app service.
7. Read the public login and an authenticated inventory response, pin compatible
   jobs and resume only timers that were already active.

There is no second serving checkout, automatic database restore, repeated
migration or automatic activation of new jobs. Fixed job bundles include their
application import closure and catalogs and carry source/output/dependency hashes;
they never fall back to edited TypeScript source. Native releases use the reviewed
entrypoints before timers resume. See [native release tooling](native-release.md).

### Select only the changed release steps

| Change | Required steps | Reuse accepted evidence |
| --- | --- | --- |
| Documentation only | Update documents/maps | App, schema, build and runtime evidence |
| UI/server code; no schema or dependencies | Web backup/build/restart, compatible jobs, login/authenticated read | Existing database backup/restore and installed-agent proof |
| Bounded SQL operation only | Inspect target, apply reviewed operation, read result | App build, dependencies and agent proof |
| Schema and code | Final readable database dump, migrate once, ledger, app build, compatible jobs and scoped readback | Unchanged agent/provider/dependency behavior |
| Dependency change | Locked installation and relevant dependency checks plus app build | Unchanged product contracts |
| Checkout/layout change | Preserve source/artifacts/private configuration/installed units; coordinate paths, build and service cutover | Existing database and installed-agent behavior |

Checks follow the changed component. Perform repository/security/provider gates
at release closeout; do not replay them for each tiny change or deployment step. After a
restart, check the service/listener, public HTTPS and one authenticated read. Check
a job's entrypoint and prior timer state when its deployment path changes. Inspect
only affected UI interactions. Failed required checks block release completion.

Recovery material stays local outside the checkout; backup policy is selected by
the operator. A previous build/job is usable only when compatible with the current
database. See [operations](../operations/runbook.md#backup-restore-and-failure-recovery).

## Debian 13 agent installation

Agent source, installation, service and packaging belong to the independent
[tinywarden-agent](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/deploy/native.md)
repository. An app release does not upgrade, re-enroll or reset installed agents.
