# Codebase map

Generated inventory from Git; authored roles live in `scripts/map-roles.json`.
Run `node scripts/codebase-map.mjs --write` after staging added/removed paths.

`app`, `components` and `server` own the web application; `deploy` owns service templates;
`scripts` owns jobs, administration and build/release gates; `docs` owns human-facing contracts.

| Tracked path | Role |
| --- | --- |
| `.editorconfig` | S2 .editorconfig; generic package integration and verification. |
| `.env.example` | Non-secret local origin, database and limit configuration example. |
| `.github/workflows/phase-closeout.yml` | Explicit phase-closeout GitHub verification; no automatic per-change triggers. |
| `.gitignore` | S2 .gitignore; generic package integration and verification. |
| `.npmrc` | S2 .npmrc; generic package integration and verification. |
| `.nvmrc` | S2 .nvmrc; generic package integration and verification. |
| `CONTRIBUTING.md` | Contributor workflow, acceptance, localization and publication conventions. |
| `LICENSE` | Apache-2.0 license for original project material. |
| `README.md` | Project status, local startup and canonical documentation entry points. |
| `THIRD_PARTY_NOTICES.md` | Preserved upstream notices for copied UI source and locally served OFL fonts. |
| `app/api/v1/agent/assignments/route.ts` | Credential-authorized versioned check-assignment fetch route. |
| `app/api/v1/agent/baseline-assignments/route.ts` | Thin Next route adapter for the separately guarded baseline HTTP root. |
| `app/api/v1/agent/baseline-runs/route.ts` | Thin Next route adapter for the separately guarded baseline HTTP root. |
| `app/api/v1/agent/disk-runs/route.ts` | Credential-authorized bounded disk run submission route. |
| `app/api/v1/agent/enroll/route.ts` | Public agent enrollment route wired to the bounded handler. |
| `app/api/v1/agent/heartbeat/route.ts` | Credential-scoped agent heartbeat route. |
| `app/api/v1/operator/agents/[id]/revoke/route.ts` | Guarded operator agent-revocation route. |
| `app/api/v1/operator/baseline-definitions/[key]/route.ts` | Thin Next route adapter for the separately guarded baseline HTTP root. |
| `app/api/v1/operator/check-definitions/disk-local/route.ts` | Guarded global disk definition read and optimistic update route. |
| `app/api/v1/operator/dashboard/route.ts` | Protected whole-fleet dashboard GET adapter. |
| `app/api/v1/operator/enrollment-tokens/[id]/revoke/route.ts` | Guarded operator token-revocation route. |
| `app/api/v1/operator/enrollment-tokens/route.ts` | Guarded operator token-issuance route. |
| `app/api/v1/operator/history/route.ts` | Protected paginated observed-history GET adapter. |
| `app/api/v1/operator/hosts/[id]/baselines/[key]/route.ts` | Thin Next route adapter for the separately guarded baseline HTTP root. |
| `app/api/v1/operator/hosts/[id]/baselines/route.ts` | Thin Next route adapter for the separately guarded baseline HTTP root. |
| `app/api/v1/operator/hosts/[id]/checks/disk-local/health/route.ts` | Thin authenticated current disk evidence route for server-page reads. |
| `app/api/v1/operator/hosts/[id]/checks/disk-local/route.ts` | Guarded host disk policy read and optimistic update route. |
| `app/api/v1/operator/hosts/[id]/route.ts` | Guarded single-host contact projection route. |
| `app/api/v1/operator/hosts/route.ts` | Guarded paginated host inventory route. |
| `app/api/v1/operator/login/route.ts` | Local administrator login route. |
| `app/api/v1/operator/logout/route.ts` | Guarded administrator logout route. |
| `app/api/v1/operator/session/route.ts` | Administrator session-state route. |
| `app/api/v1/operator/skills/[key]/enabled/route.ts` | Protected global skill enablement mutation endpoint. |
| `app/api/v1/operator/skills/route.ts` | Authorized four-skill catalog endpoint. |
| `app/api/v2/agent/skill-assignments/route.ts` | Thin versioned route adapter for generic package authority and shared controls. |
| `app/api/v2/agent/skill-packages/[id]/route.ts` | Bearer-authorized exact package transport for a current assignment. |
| `app/api/v2/agent/skill-run-starts/route.ts` | Authenticated agent durable manual-run start acknowledgement route. |
| `app/api/v2/agent/skill-runs/route.ts` | Thin versioned route adapter for generic package authority and shared controls. |
| `app/api/v2/operator/hosts/[host]/skills/[id]/metrics/[metric]/route.ts` | Protected operator metric history route; closed query input and bounded authorized read. |
| `app/api/v2/operator/hosts/[host]/skills/[id]/readings/route.ts` | Thin protected per-installation collection-history route adapter. |
| `app/api/v2/operator/hosts/[host]/skills/[id]/route.ts` | Thin versioned route adapter for generic package authority and shared controls. |
| `app/api/v2/operator/hosts/[host]/skills/[id]/run/route.ts` | Authenticated operator manual observation request route. |
| `app/api/v2/operator/hosts/[host]/skills/route.ts` | Thin versioned route adapter for generic package authority and shared controls. |
| `app/api/v2/operator/skills/[id]/defaults/route.ts` | Thin versioned route adapter for generic package authority and shared controls. |
| `app/api/v2/operator/skills/[id]/enabled/route.ts` | Thin versioned route adapter for generic package authority and shared controls. |
| `app/api/v2/operator/skills/[id]/version/route.ts` | Installed version read and explicit approved version selection route. |
| `app/api/v2/operator/skills/route.ts` | Thin versioned route adapter for generic package authority and shared controls. |
| `app/api/v2/operator/skills/upload/route.ts` | Operator ZIP upload route with disabled-first package admission. |
| `app/fleet/[id]/_components/baseline-observation.tsx` | Typed immutable observation detail with recipe/evaluator provenance and honest assurance. |
| `app/fleet/[id]/_components/disk-health.tsx` | Retained disk reading details and historical mount evidence used by the current server page. |
| `app/fleet/[id]/_components/jump-to-skill.tsx` | Searchable four-skill anchor navigation with keyboard and outside-close handling. |
| `app/fleet/[id]/_components/mount-table.tsx` | Real mount capacity bars, historical thresholds and conditional read-only disclosure. |
| `app/fleet/[id]/_components/package-card.tsx` | S2 package card; generic package integration and verification. |
| `app/fleet/[id]/_components/policy-dialog.tsx` | Accessible server settings dialog with individual inheritance, discard/conflict and exact uncertain retry. |
| `app/fleet/[id]/_components/policy-model.ts` | Strict host schema2 read and explicit per-field draft validation. |
| `app/fleet/[id]/_components/server-client.tsx` | Reference server inventory and independent 60-second bounded evidence reads. |
| `app/fleet/[id]/_components/server.css` | Responsive server cards, mounts, facts and settings dialog presentation. |
| `app/fleet/[id]/_components/skill-card.tsx` | Four existing skill states, settings intent and retained observation/provenance cards. |
| `app/fleet/[id]/page.tsx` | Guarded host detail and honest contact/health evidence. |
| `app/fleet/_components/fleet-client.tsx` | Authorized whole-fleet dashboard, independent group pages and since-midnight changes panel. |
| `app/fleet/page.tsx` | Guarded dynamic fleet dashboard route. |
| `app/globals.css` | Shared semantic color, typography and focus tokens; Tailwind entry point. |
| `app/history/history-client.tsx` | Protected retained change history with stable scoped pagination and evidence controls. |
| `app/history/history-format.ts` | Catalog-backed history labels, timezone calendar groups, real fact comparisons and limited reason descriptions. |
| `app/history/history-picker.tsx` | Accessible searchable multi-select history choices, literal remote server search and removable selection semantics. |
| `app/history/history-results.tsx` | Filter-owned guarded history reads, safe older-page accumulation, polling and permission/error feedback. |
| `app/history/history-timeline.tsx` | Bucharest day-grouped state/gap/context events and expandable stored-fact comparisons. |
| `app/history/history.css` | history filters, popovers, timeline, fact tables and narrow-screen presentation. |
| `app/history/page.tsx` | Guarded dynamic operator route. |
| `app/layout.tsx` | HTML locale, catalog-backed metadata and keyboard skip link. |
| `app/login/login.css` | Reference-matched responsive login layout, form states and reduced-motion brand animation. |
| `app/login/page.tsx` | Catalog-backed local administrator login form. |
| `app/not-found.tsx` | Catalog-backed missing-page surface and working return-home link. |
| `app/page.tsx` | Direct public entry redirect to the existing administrator login. |
| `app/playbook/example.tsx` | Public static Playbook example using the app shared components; no operator evidence. |
| `app/playbook/page.tsx` | Public static Playbook page using the app shared components; no operator evidence. |
| `app/playbook/playbook.css` | Public static Playbook playbook using the app shared components; no operator evidence. |
| `app/settings/_components/package-settings.tsx` | S2 package settings; generic package integration and verification. |
| `app/settings/_components/settings-client.tsx` | General Settings containing all four existing global editors and session boundary. |
| `app/settings/_components/skill-description.tsx` | Responsive description disclosure shown only when the rendered text is clipped. |
| `app/settings/_components/skill-model.ts` | Typed installed skills, catalog validation and cadence formatting. |
| `app/settings/_components/skill-os-filter.tsx` | Shared Skills catalog OS popup with supported release counts, search, selection and keyboard focus. |
| `app/settings/_components/skills-catalog.tsx` | Searchable installed skill categories, On/Off and verified OS filters. |
| `app/settings/_components/skills.css` | Approved Skills layout and responsive controls. |
| `app/settings/_components/use-skills.ts` | Independent idempotent global toggles and current catalog/fleet refresh. |
| `app/settings/page.tsx` | Guarded dynamic operator route. |
| `components.json` | shadcn registry, component ownership and alias configuration. |
| `components/brand/avatar.tsx` | Shared supplied pixel helmet geometry with ink visor slot. |
| `components/brand/brand.css` | Supplied brand proportions and responsive live-mascot hero placement. |
| `components/brand/logo.tsx` | Static catalog-owned lowercase brand lockup for dark/light grounds. |
| `components/brand/warden-state.ts` | Existing whole-fleet counts/freshness mapped to the live visor priority. |
| `components/brand/warden.tsx` | Bounded sweep/blink with reduced motion, replay and scoped status favicon. |
| `components/operator/change-events.tsx` | Catalog-backed state, context and gap history display with bounded reading provenance. |
| `components/operator/fleet-groups.tsx` | Faithful attention, uncertainty and healthy fleet groups with all scoped check chips. |
| `components/operator/fleet-hero.tsx` | Whole-fleet summary and exclusive health bar without synchronized-check claims. |
| `components/operator/fleet-status.tsx` | Shared authorized fleet reading across operator sections, count title and status favicon lifecycle. |
| `components/operator/format.ts` | Client-safe wire types and catalog-backed time, exact disk usage and reason formatting. |
| `components/operator/groups.css` | Approved fleet cards, check chips, healthy table and change-history styling. |
| `components/operator/layout.css` | Approved dashboard layout, navigation, Settings/history and narrow-screen adaptation. |
| `components/operator/package-pages.ts` | Assemble bounded protected package pages before updating an operator view. |
| `components/operator/page-guard.tsx` | Shared server-page operator session guard and unavailable redirect boundary. |
| `components/operator/read-validation.ts` | Bounded dashboard/history response shape validation before client display. |
| `components/operator/shell.tsx` | Operator navigation, guarded logout, draft departure event and read notices. |
| `components/operator/tokens.css` | Locally licensed fonts and scoped visual tokens for the new operator screens. |
| `components/operator/use-operator-read.ts` | Single-flight bounded protected polling with permission clearing and monotonic result expiry. |
| `components/playbook/chart-inspection.tsx` | Shared pointer/keyboard/touch reading tooltip and narrow readout. |
| `components/playbook/chart.tsx` | Shared Playbook chart; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/components-1.css` | Shared Playbook components 1; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/components-2.css` | Shared Playbook components 2; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/components-3.css` | Shared Playbook components 3; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/components-4.css` | Shared Playbook components 4; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/components-5.css` | Shared Playbook components 5; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/components-6.css` | Shared Playbook components 6; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/components-7.css` | Shared Playbook components 7; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/components.css` | Shared Playbook components; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/controls.tsx` | Shared Playbook controls; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/data.tsx` | Shared Playbook data; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/format.ts` | Shared Playbook format; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/gauge-donut.tsx` | Shared Playbook gauge donut; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/history.tsx` | Shared range, compact collection table and bounded page navigation. |
| `components/playbook/meter.tsx` | Shared Playbook meter; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/metric-figure.tsx` | Pure adaptive-history chart, range controls slot and bounded raw or summarized reading table presentation. |
| `components/playbook/navigation-example.tsx` | Public static navigation and compact-history demonstration. |
| `components/playbook/navigation.css` | Canonical Playbook v1.2 pagination, history, inspection and manual action styling. |
| `components/playbook/pagination.tsx` | Shared accessible direct page controls and bounded page entry. |
| `components/playbook/series-picker.css` | Canonical Playbook v1.3 series picker styles scoped to the shared UI. |
| `components/playbook/series-picker.tsx` | Reusable Series picker C menu, current value trails, search and keyboard interaction. |
| `components/playbook/skill-example.tsx` | Complete public skill example using the same shared frame, history, runs and settings components as real packages. |
| `components/playbook/skill.tsx` | Shared canonical skill frame, section slots, disclosures, reading rows and guarded native settings dialog. |
| `components/playbook/time-navigation.tsx` | Shared timezone-aware custom range and nearest-reading time jump popovers. |
| `components/playbook/tokens.css` | Shared Playbook tokens; canonical visual tokens/styles or reusable accessible data component. |
| `components/playbook/widgets.css` | Shared Playbook widgets; canonical visual tokens/styles or reusable accessible data component. |
| `components/skills/baseline-editor-model.ts` | Guarded saved values, draft inheritance/pins, whole-second bounds and catalog formatting. |
| `components/skills/baseline-editor.tsx` | Global baseline settings editor with preserved draft, concurrency and save/retry behavior. |
| `components/skills/disk-policy-editor.tsx` | Catalog-backed global and host disk policy editor with conflict and delivery states. |
| `components/skills/display-widget.tsx` | Generic package display widget; validated data bindings and shared widgets without skill-ID rendering branches. |
| `components/skills/metric-chart.tsx` | Generic package metric chart; validated data bindings and shared widgets without skill-ID rendering branches. |
| `components/skills/metric-fetch.ts` | Generic package metric fetch; validated data bindings and shared widgets without skill-ID rendering branches. |
| `components/skills/package-display.tsx` | Generic package package display; validated data bindings and shared widgets without skill-ID rendering branches. |
| `components/skills/package-editor.tsx` | S2 package editor; generic package integration and verification. |
| `components/skills/package-facts.tsx` | S2 package facts; generic package integration and verification. |
| `components/skills/package-history.tsx` | Lazy protected collection-log loading with pinned scope, cursors and stable same-scope refresh. |
| `components/skills/package-identity.tsx` | Collapsed exact package fingerprint and human explanation for installed/version review. |
| `components/skills/package-model.ts` | S2 package model; generic package integration and verification. |
| `components/skills/package-permissions.tsx` | Readable SDK grant review with complete commands, paths, service properties and resource limits. |
| `components/skills/package-run-now.tsx` | Shared skill observation action, retained uncertain request and truthful progress. |
| `components/skills/package-settings-dialog.tsx` | Shared Playbook modal for existing per-server skill settings; preserves field inheritance and guarded save/close behavior. |
| `components/skills/package-update-review.tsx` | Exact uploaded-version access review, compatible selection and replay-safe update confirmation. |
| `components/skills/package-upload.tsx` | Sidebar ZIP upload and integrated update review modal with file retention and uncertain request locks. |
| `components/skills/packages.css` | S2 packages; generic package integration and verification. |
| `components/skills/use-package-command.ts` | Shared package mutations with exact response callbacks and replay of uncertain requests. |
| `components/ui/button.tsx` | Owned shadcn button primitive from the explicit official registry; shared catalog-fed composition. |
| `components/ui/card.tsx` | Shared upstream shadcn card layout primitives. |
| `components/ui/field.tsx` | Owned shadcn field primitive from the explicit official registry; shared catalog-fed composition. |
| `components/ui/input.tsx` | Owned shadcn input primitive from the explicit official registry; shared catalog-fed composition. |
| `components/ui/label.tsx` | Owned shadcn label primitive from the explicit official registry; shared catalog-fed composition. |
| `components/ui/separator.tsx` | Owned shadcn separator primitive from the explicit official registry; shared catalog-fed composition. |
| `components/ui/toggle-group.tsx` | Owned shadcn toggle-group primitive from the explicit official registry; shared catalog-fed composition. |
| `components/ui/toggle.tsx` | Owned shadcn toggle primitive from the explicit official registry; shared catalog-fed composition. |
| `deploy/systemd/tinywarden-history.service` | Opt-in bounded same-checkout compiled history capture user service. |
| `deploy/systemd/tinywarden-history.timer` | Opt-in elapsed capture schedule without replay or overlapping invocations. |
| `deploy/systemd/tinywarden-notifications.service` | Opt-in bounded notification sampling/dispatch user service with private provider environment. |
| `deploy/systemd/tinywarden-notifications.timer` | Opt-in nonoverlapping elapsed notification timer without missed-tick replay. |
| `deploy/systemd/tinywarden-retention.service` | Opt-in bounded observation cleanup user service with expected database guard. |
| `deploy/systemd/tinywarden-retention.timer` | Opt-in UTC hourly cleanup timer with one downtime catch-up. |
| `deploy/systemd/tinywarden.service` | Linked user service that runs the main checkout on the owner-selected all-interface listener. |
| `docs/README.md` | Canonical document ownership and navigation index. |
| `docs/architecture/agent-protocol.md` | versioned enrollment/heartbeat wire, retry, idempotency and contact-state contract. |
| `docs/architecture/baseline-normalizers.md` | Canonical recipe, local DTO, supported format/range and server interpretation contract. |
| `docs/architecture/baseline-observations.md` | package/reboot/fstrim evidence limits and versioned delivery/result integration boundary. |
| `docs/architecture/baseline-protocol.md` | Canonical exact wire/digest/schema/state and current-view integration contract. |
| `docs/architecture/change-history.md` | independent observed transitions, capture/time bounds, midnight UI, retention and recovery contract. |
| `docs/architecture/check-definitions.md` | immutable definition/policy/delivery revisions, authorized edits and agent cache contract. |
| `docs/architecture/codebase-map.md` | Generated exhaustive Git inventory with authored non-obvious roles. |
| `docs/architecture/data-lifecycle.md` | observation retention, compact retry receipts, bounded cleanup and recovery acceptance contract. |
| `docs/architecture/data.md` | capability, schema, transaction, operator API and migration-tooling contract. |
| `docs/architecture/disk-observations.md` | all-local-filesystem coverage, bounded collection, historical evidence and health contract. |
| `docs/architecture/field-overrides.md` | Selected individual override storage, concurrency, delivery and server page contract. |
| `docs/architecture/fleet-dashboard.md` | scoped server assessments, immutable compatibility, mixed-evidence rollup and bounded authorized fleet reads. |
| `docs/architecture/notifications.md` | selected shared-health, email transition/outbox, delivery uncertainty and focused acceptance contract. |
| `docs/architecture/overview.md` | Module ownership, dependency direction and future trust boundaries. |
| `docs/architecture/package-protocol.md` | S2 package protocol; native contract documentation. |
| `docs/architecture/recipe-execution.md` | compiled command profiles, unprivileged runner identity and bounded process/output contract. |
| `docs/architecture/repositories.md` | Approved app, agent and private-memory ownership, independent verification and example provenance. |
| `docs/architecture/skill-display.md` | Specified optional skill display API: closed data bindings, shared widgets, units, limits and fallback. |
| `docs/architecture/skill-enablement.md` | Selected global skill enablement, consumer, agent and release contract. |
| `docs/architecture/skill-manual-runs.md` | Public Run now APIs, authority, progress, compatible transport and upgrade contract. |
| `docs/architecture/skill-metric-history.md` | Specified derived skill metric storage, bounded chart reads, continuity, version and retention contract. |
| `docs/architecture/skill-notification-details.md` | Selected additive skill Details descriptor, typed bindings, restricted inline styles and notification evidence contract; implementation pending. |
| `docs/architecture/skill-notification-details.schema.json` | Closed syntactic JSON schema for notification Details; cross-file reference and type checks belong to shared admission. |
| `docs/architecture/skill-packages.md` | Planned immutable Python skill package, bounded schema/archive validation and installation lifecycle contract. |
| `docs/architecture/skill-platform.md` | Planned installable skill extension, interpretation/state, compatibility and source ownership contract. |
| `docs/architecture/skill-presentation.md` | Implemented shared presentation contract, closed descriptor additions and opt-in adaptive metric history. |
| `docs/architecture/skill-runtime.md` | Planned untrusted skill isolation, host observation grants, budgets and runtime conformance contract. |
| `docs/architecture/skill-widget-structure.md` | Specified shared section roles and compact paged reading history; implementation pending. |
| `docs/deploy/configuration.md` | origin, database, cadence, agent-state and request-limit configuration contract. |
| `docs/deploy/native-release.md` | First native install, exact source release entry point, agent package, optional jobs and recovery operations. |
| `docs/deploy/native.md` | Native release/service/configuration contract and activation decision gates. |
| `docs/development/third-party.md` | Dependency rights review and redistribution notice obligations. |
| `docs/development/toolchain.md` | Verified stack versions, compatibility decisions and commands. |
| `docs/development/verification.md` | Check matrix, phase-closeout cadence and exact verification procedures. |
| `docs/operations/runbook.md` | Operator procedures and explicit readiness/recovery boundaries. |
| `docs/security/access.md` | local administrator, session/CSRF, credential lifecycle, secret and audit contract. |
| `docs/security/boundaries.md` | Operator/agent trust, sensitive data and future protocol invariants. |
| `docs/ui/contract.md` | Local UI, accessibility, responsiveness and component ownership contract. |
| `docs/ui/localization.md` | Catalog-only copy policy and future locale-formatting gates. |
| `docs/ui/playbook.md` | Public shared token/component ownership, imports, actual widget gallery and community display API guide. |
| `docs/usage.md` | User guide to current pages, four skills, inheritance, history and email limitations. |
| `eslint.config.mjs` | Supported TypeScript, Next and hooks lint rules with semantic checks. |
| `i18n/messages.ts` | Typed English catalog access and the single enabled locale. |
| `lib/skills/builtin/disk.ts` | Disk skill compatibility identity, category and agent capability. |
| `lib/skills/builtin/packages.ts` | Package skill compatibility identity, category and normalizer/evaluator metadata. |
| `lib/skills/builtin/reboot.ts` | Reboot skill compatibility identity, category and normalizer/evaluator metadata. |
| `lib/skills/builtin/trim.ts` | Trim skill compatibility identity, category and normalizer/evaluator metadata. |
| `lib/skills/catalog.ts` | Client-safe compiled skill registration, wire/display order and version metadata. |
| `lib/skills/display-bindings.ts` | Client-safe display display bindings; closed descriptors, typed sources, units and historical response contract. |
| `lib/skills/display-layout.ts` | Generic display role normalization for current results, graphs and supporting details. |
| `lib/skills/display-types.ts` | Client-safe display display types; closed descriptors, typed sources, units and historical response contract. |
| `lib/skills/display-values.ts` | Client-safe display display values; closed descriptors, typed sources, units and historical response contract. |
| `lib/skills/metric-types.ts` | Client-safe display metric types; closed descriptors, typed sources, units and historical response contract. |
| `lib/skills/notification-details.ts` | Generic bounded Details binding, plural and inline formatter; literal escaping and generic fallback. |
| `lib/skills/notification-types.ts` | Optional typed notification descriptor, literal value bindings and three permitted inline marks. |
| `lib/skills/package-grants.ts` | Validate visible systemd grant scopes before review or assignment. |
| `lib/skills/package-types.ts` | S2 package types; generic package integration and verification. |
| `lib/skills/reading-types.ts` | Shared compact collection log response and card time windows. |
| `lib/skills/schema-values.ts` | S2 schema values; generic package integration and verification. |
| `lib/skills/types.ts` | Shared client-safe settings, skill view and editor callback types. |
| `messages/en.json` | Application-owned English visible copy, accessible labels and metadata. |
| `next.config.ts` | Next server configuration and disabled framework UI indicators. |
| `package-lock.json` | S2 package lock; generic package integration and verification. |
| `package.json` | S2 package; generic package integration and verification. |
| `postcss.config.mjs` | Tailwind PostCSS build integration. |
| `public/brand/favicon-critical.svg` | Static pixel Warden favicon; critical visor state. |
| `public/brand/favicon-healthy.svg` | Static pixel Warden favicon; healthy visor state. |
| `public/brand/favicon-unknown.svg` | Static pixel Warden favicon; unknown visor state. |
| `public/brand/favicon-warning.svg` | Static pixel Warden favicon; warning visor state. |
| `public/brand/favicon.svg` | Static pixel Warden favicon; default brand lime. |
| `public/fonts/bricolage-OFL.txt` | Complete upstream font copyright and SIL OFL 1.1 redistribution notice. |
| `public/fonts/bricolage-grotesque.woff2` | Unmodified proposal WOFF2 font under SIL OFL 1.1; see adjacent complete notices. |
| `public/fonts/ibm-plex-mono-medium.woff2` | Unmodified proposal WOFF2 font under SIL OFL 1.1; see adjacent complete notices. |
| `public/fonts/ibm-plex-mono-regular.woff2` | Unmodified proposal WOFF2 font under SIL OFL 1.1; see adjacent complete notices. |
| `public/fonts/ibm-plex-sans.woff2` | Unmodified proposal WOFF2 font under SIL OFL 1.1; see adjacent complete notices. |
| `public/fonts/plex-OFL.txt` | Complete upstream font copyright and SIL OFL 1.1 redistribution notice. |
| `runtime/skills/archives.py` | Pinned trusted SDK: strict bounded ZIP extraction and canonical archive publication. |
| `runtime/skills/artifact.json` | Pinned runtime artifact.json for integrity/readiness checks. |
| `runtime/skills/broker.py` | Capability intersection and bounded supervision of trusted host IO children. |
| `runtime/skills/capture.py` | Nonblocking IO, aggregate budget checks and bounded broker responses. |
| `runtime/skills/cgroups.py` | Every guest and broker child enters an enforced subtree before exec. |
| `runtime/skills/display.py` | Static closed display admission; catalog/source/unit/widget bounds without package execution. |
| `runtime/skills/display_widgets.py` | Static closed display admission; catalog/source/unit/widget bounds without package execution. |
| `runtime/skills/files.py` | Descriptor-relative no-follow access, including intermediate path components. |
| `runtime/skills/grants.py` | Declarative requests must satisfy package, administrator and local ceilings. |
| `runtime/skills/inspector.py` | Bounded metadata parsing worker. Never import or execute package code. |
| `runtime/skills/json_values.py` | Bounded JSON is shared by admission, execution and the host broker. |
| `runtime/skills/launcher.py` | Trusted guest launcher; this file alone imports package code inside isolation. |
| `runtime/skills/notifications.py` | Mirrored author SDK static notification descriptor inspection; no package execution. |
| `runtime/skills/outcomes.py` | Validate all package-owned display data and engine-bounded time transitions. |
| `runtime/skills/package_files.py` | Read package bytes using bounded descriptor-relative traversal, never links. |
| `runtime/skills/packages.py` | Directory admission and executable identity; ZIP transport is a separate layer. |
| `runtime/skills/probe/LICENSE` | Pinned runtime LICENSE for integrity/readiness checks. |
| `runtime/skills/probe/README.md` | Pinned runtime README.md for integrity/readiness checks. |
| `runtime/skills/probe/messages/en.json` | Pinned runtime en.json for integrity/readiness checks. |
| `runtime/skills/probe/observation.schema.json` | Pinned runtime observation.schema.json for integrity/readiness checks. |
| `runtime/skills/probe/settings.schema.json` | Pinned runtime settings.schema.json for integrity/readiness checks. |
| `runtime/skills/probe/skill.json` | Pinned runtime skill.json for integrity/readiness checks. |
| `runtime/skills/probe/skill.py` | def validate_settings(settings):. |
| `runtime/skills/probe/state.schema.json` | Pinned runtime state.schema.json for integrity/readiness checks. |
| `runtime/skills/publisher.py` | Freeze validated source into a private content store without following links. |
| `runtime/skills/sandbox.py` | Explicit namespaces and minimal read-only distro runtime mounts. |
| `runtime/skills/schema.py` | Closed, non-executable schema subset. No references or implicit coercion. |
| `runtime/skills/seccomp.py` | Native-architecture BPF allowlist exported by distro libseccomp. |
| `runtime/skills/supervisor.py` | Trusted host process. Package imports occur only in launcher.py inside bwrap. |
| `runtime/skills/worker.py` | Trusted host IO child. Even blocked host reads share the invocation budget. |
| `scripts/build-native-jobs.mjs` | Exact immutable Git-object native job packaging with bundled application closure, locked build-tool version and hash manifest. |
| `scripts/check-agent-fixtures.mjs` | Validate local vendored agent example inventory/digests and optional exact Git source. |
| `scripts/check-dependencies.mjs` | Complete npm audit with the owner-approved, exact advisory/dev-path/lockfile/expiry exception and failure on other findings. |
| `scripts/check-dependencies.test.mjs` | Saved-report audit exception acceptance plus unrelated finding/path, lock/runtime/expiry and malformed/execution rejection regressions. |
| `scripts/check-localization.mjs` | TypeScript AST check for literal JSX text and accessible copy attributes. |
| `scripts/check-secrets.sh` | Phase-end redacted secret scan of the exact staged publication snapshot. |
| `scripts/check-source.mjs` | Source physical-line limits and prohibited tracked-file checks. |
| `scripts/codebase-map.mjs` | Deterministic inventory rendering and role completeness/staleness validation. |
| `scripts/history.ts` | Guarded local history capture/status/epoch-reset CLI; never enables its own service. |
| `scripts/install-native-services.mjs` | Render portable native templates for a custom checkout and install independent private user-service copies with recovery. |
| `scripts/install-native-services.test.mjs` | Verify custom/escaped checkout paths and independent installation replacing old repository symlinks without modifying their targets. |
| `scripts/inventory.mjs` | Shared Git-owned inventory and repository root resolution. |
| `scripts/map-roles.json` | Authored descriptions for all non-obvious tracked paths. |
| `scripts/native-release-jobs.mjs` | Exact-tree fixed maintenance artifact verification and owned override pinning before timer resume. |
| `scripts/native-release-jobs.test.mjs` | Fixed job source/output tampering and override preservation tests without live services. |
| `scripts/native-release-source.mjs` | Immutable Git tree capture and exact runtime inventory/SHA256 verification without changing the real index. |
| `scripts/native-release-system.mjs` | Private environment/database/service tool boundaries and bounded authenticated release smoke. |
| `scripts/native-release.mjs` | Exact-source scoped app release planning/apply, preserved recovery, authenticated smoke and fixed-job handoff. |
| `scripts/native-release.test.mjs` | Synthetic native release safety, scoping, recovery, draining and guarded existing-PostgreSQL dump proof. |
| `scripts/notifications.ts` | Guarded local configure/run/status/uncertainty-acknowledgement CLI adapter. |
| `scripts/operator.ts` | Catalog-backed terminal-only administrator initialization and reset commands. |
| `scripts/retention.ts` | Local maintenance CLI with explicit database target, default dry-run and opt-in apply. |
| `scripts/skills-notification-release.ts` | Privileged guarded release activation for four reviewed unchanged collectors; no public continuation flag. |
| `scripts/skills.ts` | S2 skills; generic package integration and verification. |
| `scripts/testdata/npm-u1-dev-advisory.json` | Authored npm audit regression fixture captured 2026-10-03 for the explicitly approved development-only advisory and transitive rows. |
| `scripts/verification.test.mjs` | Regression cases for map completeness, source limits and literal-copy guards. |
| `scripts/verify.sh` | Independent app source/map/catalog/example/static/test and phase-end build/dependency/secret checks. |
| `server/access/audit.ts` | Transactional application audit inserts. |
| `server/access/operator.ts` | Local administrator initialization, login, reset and durable login limits. |
| `server/access/password.ts` | Bounded scrypt hashing, verification and password policy. |
| `server/access/session.ts` | Opaque cookie sessions, expiry, logout and concurrency cap. |
| `server/config.ts` | Strict runtime origin, database and request-limit configuration. |
| `server/db/baseline-types.ts` | Additive typed baseline table contracts with bounded JSON evidence columns. |
| `server/db/client.ts` | Bounded PostgreSQL/Kysely adapter with exact-session failure observers and runtime singleton. |
| `server/db/history-types.ts` | Typed observed-history control, scoped subject cursors and immutable event storage. |
| `server/db/json.ts` | S2 json; generic package integration and verification. |
| `server/db/ledger.ts` | Exact current migration-ledger guard shared by native maintenance roots. |
| `server/db/manual-run-types.ts` | Typed durable manual observation requests and captured authority scope. |
| `server/db/metric-types.ts` | Typed derived metric tables and bounded extraction flags. |
| `server/db/migrate.ts` | Explicit owner-checked migration command. |
| `server/db/migrations/001_initial.ts` | Initial constrained access, host, agent, token, credential and audit schema. |
| `server/db/migrations/002_audit_target_agent.ts` | Additive audit target-agent foreign key and index migration. |
| `server/db/migrations/003_check_definitions.ts` | Additive constrained definition, policy, snapshot, receipt and audit history schema. |
| `server/db/migrations/004_disk_runs.ts` | Additive scoped immutable disk run and typed mount history schema. |
| `server/db/migrations/005_disk_recovery_latches.ts` | Additive generation-scoped persistent disk authority recovery markers. |
| `server/db/migrations/006_baseline_definitions.ts` | Additive immutable baseline defaults/policies/snapshots/receipts and typed audit constraints/seeds. |
| `server/db/migrations/007_baseline_runs.ts` | Scoped baseline run uniqueness/history and generation-scoped recovery schema. |
| `server/db/migrations/008_observation_retention.ts` | Additive compact removed-run receipts, expiry indexes and typed retention audit constraints. |
| `server/db/migrations/009_notifications.ts` | Additive notification scope/outbox/audit constraints and due/current indexes. |
| `server/db/migrations/010_fleet_history.ts` | Additive assessment metadata, scoped history storage/indexes and history cleanup audit shape. |
| `server/db/migrations/011_fstrim_context.ts` | Additive bounded trim context and assessment-v3 compatibility without historical rewrites. |
| `server/db/migrations/012_skill_enablement.ts` | Additive global enablement, assignment/history/mail scope versions and receipts. |
| `server/db/migrations/013_field_overrides.ts` | Additive nullable canonical individual override masks with legacy preservation. |
| `server/db/migrations/014_package_skills.ts` | S2 014 package skills; generic package integration and verification. |
| `server/db/migrations/015_package_subjects.ts` | S2 015 package subjects; generic package integration and verification. |
| `server/db/migrations/016_skill_metrics.ts` | Additive derived metric frames/samples, query index and observation-retention cascades. |
| `server/db/migrations/017_notification_messages.ts` | Additive template 2 and bounded immutable message snapshot schema. |
| `server/db/migrations/018_skill_manual_runs.ts` | Additive bounded manual request schema and negotiated runtime support. |
| `server/db/migrations/019_skill_collection_history.ts` | Additive expression index for chronological compact collection history. |
| `server/db/migrations/020_agent_contact.ts` | Additive separate current-agent contact timestamp and heartbeat backfill. |
| `server/db/migrations/021_agent_storage_budget.ts` | Durable per-agent allocation/rate budgets and absolute mount admission constraint. |
| `server/db/notification-types.ts` | Typed notification route, subject cursor, outbox and scope/state records. |
| `server/db/package-skill-types.ts` | S2 package skill types; generic package integration and verification. |
| `server/db/skill-types.ts` | Global control and skill mutation receipt database types. |
| `server/db/snapshot-read.ts` | Bounded retry of rolled-back session-authenticated repeatable-read snapshots; no domain writes or external actions. |
| `server/db/target.ts` | Shared exact database/role/schema ownership guard for migration and maintenance roots. |
| `server/db/types.ts` | Typed database rows and PostgreSQL value mappings. |
| `server/errors.ts` | Stable application error codes and safe status mapping. |
| `server/fleet/agent-authority.ts` | Reusable transaction-scoped agent credential and generation authorization under credential locks. |
| `server/fleet/contact-evidence.ts` | Shared generation-scoped contact evidence and successful transaction recording, separate from heartbeat receipts. |
| `server/fleet/contact.ts` | Authoritative contact-state projection and locked local-system contact summary. |
| `server/fleet/dashboard-model.ts` | Exclusive fleet rollup, mixed evidence and validated group-bound pagination cursors. |
| `server/fleet/dashboard.ts` | Guarded bounded whole-fleet snapshot read with independent group pages and history enrichment. |
| `server/fleet/enrollment.ts` | One-time new-host enrollment, credential replacement and bounded replay handling. |
| `server/fleet/heartbeat.ts` | Credential-scoped atomic sequence and contact update. |
| `server/fleet/inventory.ts` | Authorized paginated list/detail contact projections. |
| `server/fleet/revocation.ts` | Operator-authorized agent/credential revocation under shared locks. |
| `server/fleet/tokens.ts` | Operator new-host/replacement token issuance, retry and revocation. |
| `server/history/day-window.ts` | Named Bucharest midnight boundaries including 23-hour and 25-hour calendar days. |
| `server/history/facts.ts` | Strict bounded protected history fact validation without raw observation bodies. |
| `server/history/filter-model.ts` | Authorized retained-window result/facet counts and bounded selected-first searchable server inventory. |
| `server/history/options.ts` | Strict bounded multi-host/subject/kind search inputs and canonical filter-bound keyset cursor identity. |
| `server/history/read-model.ts` | Protected event projection, daily changes, capture coverage and matching first-observed enrichment. |
| `server/history/reads.ts` | Authorized paginated history root with bounded host-bound cursors and fresh session recheck. |
| `server/history/retention.ts` | Bounded observed-history expiry and cursor-fact pruning with typed audit. |
| `server/history/run.ts` | Guarded exact-session locked history job, fair scan, clock limits, status and recovery epoch reset. |
| `server/history/sampling.ts` | Bounded family sampling through owning contact/check projections with history epoch checks. |
| `server/history/transitions.ts` | Atomic scoped cursor/event transitions, observation gaps, suspension and immutable deduplication. |
| `server/history/types.ts` | Observed-history keys, states, scopes and sample application contracts. |
| `server/http/agent-body.ts` | Authenticate credential headers before accepting bounded agent JSON bodies. |
| `server/http/baseline-handlers.ts` | Bounded versioned baseline roots with operator origin/session and agent credential authority. |
| `server/http/dashboard-handlers.ts` | Thin guarded dashboard/history transports with owning option validation and safe responses. |
| `server/http/handlers.ts` | Thin versioned operator and agent HTTP actions. |
| `server/http/json-structure.ts` | Optional strict JSON duplicate/decoded-key and nesting/node checks for baseline bodies. |
| `server/http/manual-handlers.ts` | Bounded same-origin operator request and bearer start adapters. |
| `server/http/metric-handler.ts` | Protected operator metric history route; closed query input and bounded authorized read. |
| `server/http/package-handlers.ts` | S2 package handlers; generic package integration and verification. |
| `server/http/package-pages.ts` | Bound aggregate operator metadata and result documents with byte-sized pages. |
| `server/http/reading-handler.ts` | Protected collection-history HTTP root. |
| `server/http/response.ts` | Bounded JSON parsing, origin guard and safe HTTP response boundary. |
| `server/http/skill-handlers.ts` | Strict authorized catalog and same-origin enablement request handling. |
| `server/maintenance/retention.ts` | Guarded fair cleanup orchestration across observation and history owners under one existing budget. |
| `server/notifications/audit.ts` | Notification-owned adapter to action-specific centralized audit allowlists. |
| `server/notifications/config.ts` | Validated private mail routing settings and protected scope fingerprint. |
| `server/notifications/control.ts` | Guarded route/status/acknowledgement roots and abandoned-claim recovery. |
| `server/notifications/dispatch.ts` | Current-state recheck, atomic claim/rate bounds and conditional transport finish. |
| `server/notifications/lock.ts` | Exact-session notification advisory lock and connection-failure cancellation. |
| `server/notifications/message-v2.ts` | App-owned contact/skill issue and recovery subject/body families with equivalent HTML and text. |
| `server/notifications/message.ts` | Bounded English catalog plain-text MIME message and stable event correlation. |
| `server/notifications/retention.ts` | Bounded residual prose expiry preserving incident and delivery metadata. |
| `server/notifications/run.ts` | Bounded fair notification sampling/dispatch invocation without installed scheduling. |
| `server/notifications/sampling.ts` | Local-system consumer of authoritative contact/disk/baseline summaries. |
| `server/notifications/snapshot.ts` | Original-projection bounded email snapshots, provenance and validated readback. |
| `server/notifications/transitions.ts` | Atomic definitive-state cursor, outbox supersession and recovery eligibility. |
| `server/notifications/transport.ts` | Nodemailer SMTP lifecycle/outcome adapter and isolated capture transport. |
| `server/notifications/types.ts` | Consumer-shaped summaries and normalized notification transport/result vocabulary. |
| `server/skills/assignments/baseline-delivery.ts` | Exact assignment inputs and canonical assignment/observation tuples. |
| `server/skills/assignments/baseline.ts` | Authenticated immutable scoped baseline snapshots and committed recovery latches. |
| `server/skills/assignments/disk.ts` | Agent-authorized resolved assignment snapshots, applicability and digest delivery. |
| `server/skills/assignments/package-download.ts` | Current-assignment authorized immutable archive transfer with bounded lifetime. |
| `server/skills/assignments/packages.ts` | S2 packages; generic package integration and verification. |
| `server/skills/assignments/recovery.ts` | Generation-scoped persistent disk recovery latch shared by assignment and run ingest. |
| `server/skills/catalog/controls.ts` | Definition-owned global enablement and durable operator mutation receipts. |
| `server/skills/catalog/legacy-import.ts` | S2 legacy import; generic package integration and verification. |
| `server/skills/catalog/notification-continuation.ts` | Internal admitted metadata-only release proofs and atomic reducer/incident continuation. |
| `server/skills/catalog/package-commands.ts` | S2 package commands; generic package integration and verification. |
| `server/skills/catalog/package-controls.ts` | S2 package controls; generic package integration and verification. |
| `server/skills/catalog/package-install.ts` | S2 package install; generic package integration and verification. |
| `server/skills/catalog/package-upload.ts` | Authenticated bounded ZIP ingestion, exact request identity and private staging cleanup. |
| `server/skills/catalog/package-version.ts` | S2 package version; generic package integration and verification. |
| `server/skills/legacy/disk/health-types.ts` | Shared disk current/detail health vocabulary and immutable history projection types. |
| `server/skills/legacy/disk/package-summary.ts` | S2 package summary; generic package integration and verification. |
| `server/skills/legacy/disk/projection.ts` | Shared current disk gates and exact worst-mount attention facts, including partial coverage. |
| `server/skills/legacy/disk/resolver.ts` | Shared complete disk tuple and source resolution for reads, delivery and current evidence. |
| `server/skills/legacy/disk/values.ts` | Strict disk tuple, revision, policy and capability input validation. |
| `server/skills/legacy/packages/assessment.ts` | Package skill versioned local-plan interpretation. |
| `server/skills/legacy/packages/definition.ts` | Package skill fixed APT simulation recipe construction. |
| `server/skills/legacy/packages/observation.ts` | Package skill bounded normalized count validation. |
| `server/skills/legacy/reboot/assessment.ts` | Reboot skill versioned limited marker interpretation. |
| `server/skills/legacy/reboot/definition.ts` | Reboot skill fixed local marker recipe construction. |
| `server/skills/legacy/reboot/observation.ts` | Reboot skill strict marker/assurance validation. |
| `server/skills/legacy/shared/assessment-result.ts` | Common immutable legacy assessment result constructor. |
| `server/skills/legacy/shared/assessment.ts` | Per-run server assessment versioning that preserves wire v1 and scoped clean-result assurance. |
| `server/skills/legacy/shared/evaluation.ts` | Pure server-owned package, reboot and systemd health classification within observed scope. |
| `server/skills/legacy/shared/facts.ts` | Minimal protected measurement facts shared by current projection and observed history. |
| `server/skills/legacy/shared/json.ts` | Strict bounded common observation shape/value checks. |
| `server/skills/legacy/shared/locks.ts` | Sorted baseline locks, host policy initialization and pinned source resolution. |
| `server/skills/legacy/shared/observation.ts` | Exact bounded baseline DTO validation rejecting raw data and invented assurance. |
| `server/skills/legacy/shared/projection.ts` | Pure shared baseline history/current projection under immutable assessment, source and freshness gates. |
| `server/skills/legacy/shared/recipe.ts` | Compiled baseline recipe construction and exact definition/source value guards. |
| `server/skills/legacy/shared/registry.ts` | Compiled compatibility adapter registration for recipes, validators and assessments. |
| `server/skills/legacy/shared/types.ts` | Baseline evidence, version, reason and server-assessment type vocabulary. |
| `server/skills/legacy/trim/assessment.ts` | Schedule-aware trim assessment v3 and upcoming browser invalidation boundaries. |
| `server/skills/legacy/trim/context-store.ts` | Authorized atomic ingestion context assembly, retained legacy seed and delayed-result reconciliation. |
| `server/skills/legacy/trim/context.ts` | Bounded typed retained trim execution/deadline context and deterministic sequence reducer. |
| `server/skills/legacy/trim/definition.ts` | Trim skill fixed timer/service observation recipe construction. |
| `server/skills/legacy/trim/legacy-assessment.ts` | Preserved trim interpretation for immutable assessment versions 1 and 2. |
| `server/skills/legacy/trim/observation.ts` | Trim skill bounded typed systemd evidence validation. |
| `server/skills/legacy/trim/versions.ts` | Trim skill dispatch between historical and schedule-aware assessments. |
| `server/skills/manual/agent.ts` | Negotiated request delivery, immutable start claims and atomic result completion. |
| `server/skills/manual/lifecycle.ts` | Captured scope, availability, derived expiry and transaction invalidation. |
| `server/skills/manual/operator.ts` | Operator deduplication, mutation receipts and ordinary-results feedback. |
| `server/skills/manual/retention.ts` | Bounded ninety-day request cleanup retaining compact mutation receipts. |
| `server/skills/metrics/adaptive.ts` | Bounded SQL adaptive metric history: ordered raw points or extrema-preserving summaries, evidence continuity and explicit gap bands. |
| `server/skills/metrics/buckets.ts` | Bounded skill metric buckets; original accepted evidence, exact series/version identity and gaps. |
| `server/skills/metrics/capture.ts` | Bounded skill metric capture; original accepted evidence, exact series/version identity and gaps. |
| `server/skills/metrics/compatibility.ts` | Generic retained metric compatibility by value binding, unit and series identity; bounded same-skill version selection. |
| `server/skills/metrics/extract.ts` | Bounded skill metric extract; original accepted evidence, exact series/version identity and gaps. |
| `server/skills/metrics/read.ts` | Bounded skill metric read; original accepted evidence, exact series/version identity and gaps. |
| `server/skills/metrics/request.ts` | Bounded skill metric request; original accepted evidence, exact series/version identity and gaps. |
| `server/skills/results/baseline-evidence.ts` | Transaction-neutral baseline evidence capture with source/receipt/freshness evaluation shared by authorized consumers. |
| `server/skills/results/baseline-health.ts` | Authorized baseline detail read and transaction-scoped summary boundary. |
| `server/skills/results/baseline-runs.ts` | Strict typed observation ingestion, original receipt and identity/sequence digest idempotency. |
| `server/skills/results/disk-evidence.ts` | Transaction-neutral disk evidence capture shared by operator detail and local notification summary. |
| `server/skills/results/disk-health.ts` | Authorized disk detail read and consumer-shaped transaction summary root. |
| `server/skills/results/disk-runs.ts` | Strict disk run wire validation, canonical digest, integer evaluation and atomic scoped ingest. |
| `server/skills/results/fleet-evidence.ts` | Bounded set-query current evidence adapter for coherent fleet snapshots without per-host reads. |
| `server/skills/results/package-input.ts` | S2 package input; generic package integration and verification. |
| `server/skills/results/package-prepare.ts` | S2 package prepare; generic package integration and verification. |
| `server/skills/results/package-projection.ts` | S2 package projection; generic package integration and verification. |
| `server/skills/results/package-retention.ts` | S2 package retention; generic package integration and verification. |
| `server/skills/results/package-runs.ts` | S2 package runs; generic package integration and verification. |
| `server/skills/results/reading-history.ts` | Authorized retained collection-history reads with original results, bounded notes and exact paging counts. |
| `server/skills/results/reading-request.ts` | Closed canonical bounded collection-history request and scoped keyset cursor validation. |
| `server/skills/results/receipts.ts` | Full-run/compact-receipt duplicate identity and original-receipt verification under family locks. |
| `server/skills/results/retention-policy.ts` | Canonical 90-day elapsed retention cutoff and bounded cleanup budgets. |
| `server/skills/results/retention.ts` | Checks-owned bounded observation preview/prune batches preserving immutable retry receipts and typed audit. |
| `server/skills/runtime/assets.ts` | S2 assets; generic package integration and verification. |
| `server/skills/runtime/client.ts` | S2 client; generic package integration and verification. |
| `server/skills/runtime/storage.ts` | S2 storage; generic package integration and verification. |
| `server/skills/settings/baseline.ts` | Operator-authorized optimistic/idempotent audited baseline defaults and host policy roots. |
| `server/skills/settings/disk.ts` | Audited definition and host-policy read/mutation roots with immutable revisions and receipts. |
| `server/skills/settings/field-overrides.ts` | Exact schema2 parsing, canonical custom field masks and legacy saved intent helpers. |
| `server/skills/settings/package-defaults.ts` | S2 package defaults; generic package integration and verification. |
| `server/skills/settings/package-policies.ts` | S2 package policies; generic package integration and verification. |
| `server/skills/settings/package-validation.ts` | S2 package validation; generic package integration and verification. |
| `server/validation.ts` | Exact versioned request and identifier validation. |
| `tests/agent-contact.test.ts` | Accepted contact, receipt replay, rejected authority and independent reading freshness regressions. |
| `tests/fixtures/agent/internal/agent/testdata/baseline-v1/fstrim-status.json` | Vendored pinned agent example: Authored v1 baseline assignment/response and independent canonical digest fixture shared by Go and TypeScript. |
| `tests/fixtures/agent/internal/agent/testdata/baseline-v1/package-updates.json` | Vendored pinned agent example: Authored v1 baseline assignment/response and independent canonical digest fixture shared by Go and TypeScript. |
| `tests/fixtures/agent/internal/agent/testdata/baseline-v1/reboot-required.json` | Vendored pinned agent example: Authored v1 baseline assignment/response and independent canonical digest fixture shared by Go and TypeScript. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/boot-change.json` | Vendored pinned agent example: Authored v1 fstrim-status case: boot change; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/clock-backwards.json` | Vendored pinned agent example: Authored v1 fstrim-status case: clock backwards; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/completed-service-and-schedule.json` | Vendored pinned agent example: Authored v1 fstrim-status case: completed service and schedule; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/disabled-timer.json` | Vendored pinned agent example: Authored v1 fstrim-status case: disabled timer; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/event-during-reads.json` | Vendored pinned agent example: Authored v1 fstrim-status case: event during reads; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/expired-next-trigger.json` | Vendored pinned agent example: Authored v1 fstrim-status case: expired next trigger; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/failed-service.json` | Vendored pinned agent example: Authored v1 fstrim-status case: failed service; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/fractional-epoch-seconds.json` | Vendored pinned agent example: Authored v1 fstrim-status case: fractional epoch seconds; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/future-history.json` | Vendored pinned agent example: Authored v1 fstrim-status case: future history; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/inactive-timer.json` | Vendored pinned agent example: Authored v1 fstrim-status case: inactive timer; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/lost-condition-history.json` | Vendored pinned agent example: Authored v1 fstrim-status case: lost condition history; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/malformed-timestamp.json` | Vendored pinned agent example: Authored v1 fstrim-status case: malformed timestamp; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/missing-timer.json` | Vendored pinned agent example: Authored v1 fstrim-status case: missing timer; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/never-run-default-success.json` | Vendored pinned agent example: Authored v1 fstrim-status case: never run default success; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/new-trigger-unconfirmed.json` | Vendored pinned agent example: Authored v1 fstrim-status case: new trigger unconfirmed; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/reversed-service-times.json` | Vendored pinned agent example: Authored v1 fstrim-status case: reversed service times; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/running-service.json` | Vendored pinned agent example: Authored v1 fstrim-status case: running service; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/skipped-condition.json` | Vendored pinned agent example: Authored v1 fstrim-status case: skipped condition; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/unknown-monotonic-schedule.json` | Vendored pinned agent example: Authored v1 fstrim-status case: unknown monotonic schedule; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/fstrim-status/wrong-unit-id.json` | Vendored pinned agent example: Authored v1 fstrim-status case: wrong unit id; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/broken-package-state.json` | Vendored pinned agent example: Authored v1 package-updates case: broken package state; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/changed-local-state-is-unverified.json` | Vendored pinned agent example: Authored v1 package-updates case: changed local state is unverified; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/changed-presentation.json` | Vendored pinned agent example: Authored v1 package-updates case: changed presentation; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/diagnostics-with-zero-summary.json` | Vendored pinned agent example: Authored v1 package-updates case: diagnostics with zero summary; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/duplicate-summary.json` | Vendored pinned agent example: Authored v1 package-updates case: duplicate summary; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/empty-cache-zero-is-unverified.json` | Vendored pinned agent example: Authored v1 package-updates case: empty cache zero is unverified; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/empty-output.json` | Vendored pinned agent example: Authored v1 package-updates case: empty output; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/inaccessible-cache.json` | Vendored pinned agent example: Authored v1 package-updates case: inaccessible cache; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/new-dependencies.json` | Vendored pinned agent example: Authored v1 package-updates case: new dependencies; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/no-summary.json` | Vendored pinned agent example: Authored v1 package-updates case: no summary; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/out-of-range-count.json` | Vendored pinned agent example: Authored v1 package-updates case: out of range count; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/pending-upgrades.json` | Vendored pinned agent example: Authored v1 package-updates case: pending upgrades; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/reinstall-presentation.json` | Vendored pinned agent example: Authored v1 package-updates case: reinstall presentation; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/sensitive-preamble-is-dropped.json` | Vendored pinned agent example: Authored v1 package-updates case: sensitive preamble is dropped; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/truncated-output.json` | Vendored pinned agent example: Authored v1 package-updates case: truncated output; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/unexpected-removal.json` | Vendored pinned agent example: Authored v1 package-updates case: unexpected removal; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/package-updates/zero-cached-plan.json` | Vendored pinned agent example: Authored v1 package-updates case: zero cached plan; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/reboot-required/inaccessible-path-is-unverified.json` | Vendored pinned agent example: Authored v1 reboot-required case: inaccessible path is unverified; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/reboot-required/marker-not-observed.json` | Vendored pinned agent example: Authored v1 reboot-required case: marker not observed; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/reboot-required/marker-present.json` | Vendored pinned agent example: Authored v1 reboot-required case: marker present; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/reboot-required/unexpected-exit.json` | Vendored pinned agent example: Authored v1 reboot-required case: unexpected exit; shared normalization and assessment fixture. |
| `tests/fixtures/agent/internal/baseline/testdata/reboot-required/unexpected-output.json` | Vendored pinned agent example: Authored v1 reboot-required case: unexpected output; shared normalization and assessment fixture. |
| `tests/fixtures/agent/manifest.json` | Exact agent repository/revision and SHA-256 per vendored protocol/normalization example. |
| `tests/messages.test.ts` | Validates nonempty plain-text catalog leaves. |
| `tests/n1.notifications.test.ts` | Reserved PostgreSQL capture proof of same-route copy upgrade, legacy draining, frozen retries and prose cleanup. |
| `tests/operator-tty.py` | Synthetic terminal harness proving passwords remain hidden. |
| `tests/p1b.boundaries.test.ts` | boundary, expiry, concurrency and authorization acceptance cases. |
| `tests/p1b.cli.test.ts` | terminal-only administrator command acceptance cases. |
| `tests/p1b.integration.test.ts` | transactional access and enrollment acceptance cases. |
| `tests/p1b.migrations.test.ts` | migration, ownership and SQL constraint acceptance cases. |
| `tests/p1c.server.test.ts` | heartbeat, scope, pagination, freshness and read-failure acceptance cases. |
| `tests/p1d.audit.test.ts` | Audit actor, target and action-shape validation cases. |
| `tests/p1d.lifecycle.test.ts` | replacement, revocation, race and audit-rollback acceptance cases. |
| `tests/p1d.session-timing.test.ts` | Held-lock session expiry, idle timeout and clock-regression acceptance cases. |
| `tests/p4a.fixture.ts` | Guarded reserved-database lifecycle fixtures and independent synthetic authority/retention clocks. |
| `tests/p4a.recovery.test.ts` | Populated additive upgrade and receipt/credential/latch-aware synthetic restore acceptance. |
| `tests/p4a.restore.ts` | Synthetic restricted dump/restore helper owning one disposable database on the existing PostgreSQL instance. |
| `tests/p4a.retention.test.ts` | Cutoff, duplicate, concurrency, rollback, bounds, timeout and CLI isolation regression proofs. |
| `tests/p4b.config.test.ts` | config synthetic notification acceptance fixture/tests. |
| `tests/p4b.fixture.ts` | fixture synthetic notification acceptance fixture/tests. |
| `tests/p4b.health.test.ts` | health synthetic notification acceptance fixture/tests. |
| `tests/p4b.limits.test.ts` | limits synthetic notification acceptance fixture/tests. |
| `tests/p4b.smtp.fixture.ts` | smtp.fixture synthetic notification acceptance fixture/tests. |
| `tests/p4b.smtp.test.ts` | smtp synthetic notification acceptance fixture/tests. |
| `tests/p4b.states.test.ts` | states synthetic notification acceptance fixture/tests. |
| `tests/security-fixes.test.ts` | Focused body, cadence, grant, fact, timestamp, path and pagination regression checks. |
| `tests/security-ingestion.test.ts` | Per-agent storage limits, retry identity, retention refunds and assignment churn proofs. |
| `tests/skills/assessment/versions.test.ts` | Legacy/v2 assurance compatibility, Bucharest daylight-saving boundaries and scoped cursor rejection. |
| `tests/skills/baseline/definitions.test.ts` | TS consumption of shared v1 fixtures, evaluator version rejection and English reason coverage. |
| `tests/skills/baseline/delivery.test.ts` | Additive defaults/audit, policy pins, applicability, strict input and idempotent edit proofs. |
| `tests/skills/baseline/editor.test.ts` | Editor value bounds, dormant inherited draft and explicit pin/key validation. |
| `tests/skills/baseline/fixture.ts` | Reserved-database synthetic baseline identity, request and typed observation fixtures. |
| `tests/skills/baseline/observations.test.ts` | Malformed/contradictory evidence, unsupported values and false healthy-state regressions. |
| `tests/skills/baseline/protocol.test.ts` | Independent authored assignment tuple/digest and strict JSON structure checks. |
| `tests/skills/baseline/recovery.test.ts` | Committed restore-conflict latch, no-cache bypass, scoped generation recovery and atomic/concurrent roots. |
| `tests/skills/baseline/runs.test.ts` | Immutable first receipt, sequence order, contact/source clocks, stale health and protected typed evidence. |
| `tests/skills/disk/fixture.ts` | Guarded synthetic operator, host, credential and request test fixture. |
| `tests/skills/disk/latch-boundaries.test.ts` | Guarded identity, authorization, concurrent marker and retained-history recovery boundaries. |
| `tests/skills/disk/recovery.test.ts` | Guarded delayed receipt, stale health and database-regression recovery cases. |
| `tests/skills/disk/runs.test.ts` | Guarded result idempotency, scope, rollback, evaluation and freshness acceptance cases. |
| `tests/skills/disk/settings.test.ts` | Guarded migration, policy, concurrency, audit and assignment acceptance cases. |
| `tests/skills/enablement/controls.test.ts` | Reserved-database global enablement, freshness, history and notification boundary proof. |
| `tests/skills/packages/display.test.ts` | Focused display.test acceptance for display semantics, exact evidence, isolation and/or bounded history. |
| `tests/skills/packages/fixtures/memory-pressure/LICENSE` | Self-contained memory-pressure package LICENSE; source, metadata or pinned test evidence. |
| `tests/skills/packages/fixtures/memory-pressure/README.md` | Self-contained memory-pressure package README.md; source, metadata or pinned test evidence. |
| `tests/skills/packages/fixtures/memory-pressure/messages/en.json` | Self-contained messages package en.json; source, metadata or pinned test evidence. |
| `tests/skills/packages/fixtures/memory-pressure/notifications.json` | Independent community Details declaration using scalar facts, effective thresholds and all three allowed marks. |
| `tests/skills/packages/fixtures/memory-pressure/observation.schema.json` | Self-contained memory-pressure package observation.schema.json; source, metadata or pinned test evidence. |
| `tests/skills/packages/fixtures/memory-pressure/settings.schema.json` | Self-contained memory-pressure package settings.schema.json; source, metadata or pinned test evidence. |
| `tests/skills/packages/fixtures/memory-pressure/skill.json` | Self-contained memory-pressure package skill.json; source, metadata or pinned test evidence. |
| `tests/skills/packages/fixtures/memory-pressure/skill.py` | Self-contained memory-pressure package skill.py; source, metadata or pinned test evidence. |
| `tests/skills/packages/fixtures/memory-pressure/state.schema.json` | Self-contained memory-pressure package state.schema.json; source, metadata or pinned test evidence. |
| `tests/skills/packages/fixtures/official-packages.json` | Self-contained fixtures package official-packages.json; source, metadata or pinned test evidence. |
| `tests/skills/packages/manual.test.ts` | Existing PostgreSQL manual concurrency, scope, legacy wire, start/replay, timeout and pruning proof. |
| `tests/skills/packages/metrics.test.ts` | Focused metrics.test acceptance for display semantics, exact evidence, isolation and/or bounded history. |
| `tests/skills/packages/notification-continuation.test.ts` | Reserved PostgreSQL proof of overdue trim, no-resend continuation, immutable readings, replay and normal version reset. |
| `tests/skills/packages/notification-fixture.ts` | Canonical official metadata for shared Details tests. |
| `tests/skills/packages/notifications.test.ts` | Generic Details phrases, types, plural/format bounds, literal escape and four email families. |
| `tests/skills/packages/reading-history.test.ts` | Collection request, legacy display normalization and existing-PostgreSQL history acceptance. |
| `tests/skills/packages/runtime.test.ts` | S2 runtime.test; generic package integration and verification. |
| `tests/skills/packages/upload.test.ts` | ZIP admission, retry, version, authorization and exact transport integration tests. |
| `tests/skills/settings/field-overrides.test.ts` | Reserved PostgreSQL proof of individual inheritance, replay, conflicts, migration and shared consumers. |
| `tests/skills/trim/schedule.test.ts` | Focused reboot, schedule, failure, retention, ordering/retry and shared-consumer acceptance. |
| `tests/u1.history.test.ts` | Existing-instance proof of current rollup, independent durable history, gaps, retries, pruning, locks and authorization. |
| `tests/u4.history-filters.test.ts` | Reserved-PostgreSQL retained-window totals, multi-filter/cursor/auth/search bounds and DST calendar regressions. |
| `tests/ui/navigation.test.ts` | Displayed-zone conversion, invalid-calendar and daylight-saving regression checks. |
| `tsconfig.json` | Strict web TypeScript and bundler-resolution contract. |
| `vitest.config.ts` | Focused web unit-test discovery. |
