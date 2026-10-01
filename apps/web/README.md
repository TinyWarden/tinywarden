# Web application

Use Node 24 and npm 11. Install with `npm ci --no-audit --no-fund`.
`npm run dev` starts the web app on loopback. `npm run build` and
`npm start` exercise the production bundle. Product API requests need a configured
PostgreSQL database; static build does not connect to one.

Page copy, metadata and accessible labels come from `messages/en.json` through
`i18n/messages.ts`. All rendering is server-side except library boundaries that
need client behavior. P1.B adds guarded operator login/session/token routes and
new-host enrollment, with one database owner login. P1.C adds agent heartbeat,
guarded fleet list/detail routes and a responsive fleet view. The status is contact
freshness only; host health remains unknown. No telemetry is installed.
P1.D adds guarded agent revocation and target-bound credential replacement through
the existing enrollment route. Audit actor and target IDs are stored separately.
P2.A adds audited disk-default and host-policy edits, immutable assignment
snapshots and capability-scoped delivery. P2.B adds bounded immutable disk run
ingest and server-derived current health and snapshot-backed host history. The
host page keeps saved policy, delivery, contact and observed health distinct.

The explicit `npm run migrate -- <expected-database-name>` command applies migrations
using `DATABASE_URL`. `npm run operator -- init` and `npm run operator -- reset-password`
require a local interactive terminal. Set `TW_TEST_DATABASE_URL` to the reserved
`tinywarden_test_p1b` connection before running P1.B–P2.A integration tests. The test
database is on the existing PostgreSQL instance; fixture reset is limited by an
exact database/owner check. [P1 configuration](../../docs/deploy/configuration.md)
owns the setup contract. Live database migrations require release authority.

See [verification](../../docs/development/verification.md),
[UI](../../docs/ui/contract.md) and [localization](../../docs/ui/localization.md).
The owner-approved P2 single-checkout live migration, stopped-service build,
backup hashes and smoke results are recorded in the
[upgrade record](../../docs/deploy/p2-live-upgrade.md).

P3.C adds separate baseline delivery/result routes, additive migrations 006/007,
server-owned evaluation/history and global/host settings. See the
[baseline protocol](../../docs/architecture/baseline-protocol.md),
[acceptance](../../docs/development/p3-acceptance.md) and
[single-checkout upgrade](../../docs/deploy/p3-live-upgrade.md).
Never run schema-resetting tests, `npm ci` or `next build` in the serving checkout
without the required operational window. Phase gates use an independently copied
verification tree and only the guarded reserved test database.
