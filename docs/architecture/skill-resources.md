# Resource discovery, selection and independent skill subjects

Status: implemented and accepted, 2026-10-18. The app and additive schema 030 are
activated. Managed agent 0.0.11 provides the compatible runtime; Services 1.0.0 is
the first consumer. SDK 1 shapes and limits remain compatible.

## Outcome and ownership

A skill can discover resources on a server, let an administrator select explicit
resources, and report independent health subjects for them. Services is the first
consumer. Containers, devices or other future resources can use the same selection,
persistence, presentation, history and notification machinery. Their collectors
and health rules still belong to their packages and reviewed host capabilities.

| Owner | Responsibility |
| --- | --- |
| Agent broker | Bounded, granted observations of the host; no interpretation of skill health. |
| Skill package | Discovery normalization, stable resource keys, eligibility explanations, observations and deterministic per-resource evaluation. |
| Platform | Metadata validation, inventory storage, explicit selections, authority/freshness, subject identities, aggregate health, history and alert delivery. |
| Shared Playbook | Resource table/selector, state presentation, pagination and interactions. |

No app or agent switch on `tinywarden/services`, hardcoded service names, or
package-supplied React/HTML/CSS is allowed. New host operations require platform
work; another package using existing operations and these contracts does not.

## Implementation owners

- `lib/skills/resource-types.ts` and `resource-values.ts`: bounded wire contracts.
- Canonical SDK `tinywarden-agent/sdk/python/runtime/`: package validation,
  `resources.py`, fixed `systemd_services.py`, broker and supervisor. App
  `runtime/skills/` pins those exact runtime bytes and hashes.
- `server/skills/resources/`: selection epochs, scalar revision, contact checks,
  latest inventory, independent event projection and bounded retention.
- Migration 030 extends generic tables; it does not create service-specific data.
- `components/playbook/resource-selector.tsx`: shared selector/table and gallery;
  `components/skills/resource-*`: ordinary generic editor/result consumers.

## Versioned package contract

Introduce package **format 2 / SDK 2**, retaining the Python 3.13 sandbox and all
SDK v1 behavior. Both formats are accepted by upgraded runtimes; old runtimes must
never receive a format 2 assignment. Keep the existing content-digest algorithm:
the manifest and every descriptor remain part of immutable content identity.

Format 2 adds a bounded `resource_collections` declaration to `skill.json`. Each
collection has a stable key, catalogue label/help references, a selection field,
and declared discovery/selection limits within platform ceilings. A selection
field has `scope: host` and a resource-selector editor binding. Its setting schema
is a bounded array of unique resource-key strings; its global default is `[]`.
Existing scalar defaults/overrides work as before. Arbitrary nested user settings
and executable editor definitions are outside this extension.

One collection is enough for Services. The contract permits up to four per package,
within one shared run/selection budget. Reject duplicate collection/field bindings,
unbounded schemas, conflicting editor metadata and unknown version features.

`collect(settings, host)` retains its entrypoint but SDK 2 returns an envelope:

```json
{
  "observation": {"package_owned": "selected resource measurements"},
  "resources": [{
    "collection": "services",
    "complete": true,
    "reason": null,
    "items": [{
      "key": "example.service",
      "label": "example.service",
      "description": "Example service",
      "selectable": true,
      "selection_reason": null,
      "state": {"key": "running", "params": {}}
    }]
  }]
}
```

Exact closed validators and shared Python/TypeScript positive/negative fixtures
enforce this shape. Resource labels/descriptions
are bounded escaped plain text; state and selection explanations reference the
package catalogue. Keys are opaque to the app, stable across readings and labels,
and unique within a collection. Reject controls, malformed UTF-8 and duplicates.
Never derive identity from row position, description, current state or process ID.

The trusted runtime validates and separates inventory from `observation` before
calling pure reduction/evaluation. Discovery data does not inflate reducer context
or every retained reading. Failed discovery can return `complete:false` with a safe
reason while selected resources still have valid measurements. Capability denial,
sandbox failure and malformed envelopes retain their fatal invocation behavior.

SDK 2 evaluation returns a bounded timeline with `from`, shared facts, and
`subjects`. Each subject names its collection/key, one of healthy/warning/critical/
unknown, a catalogue reason and bounded facts. It must cover **exactly the saved
selection** at every timeline point. Reject missing, duplicate or unselected
subjects; never silently drop a selected problem. Display facts do not define
subjects. The platform supplies effective subject scope/selection epochs to the
pure context so remembered state can distinguish removal and re-addition.

The engine computes the single dashboard status from valid subjects:
critical, then warning, then unknown, then healthy. A known critical remains
visible alongside an unknown subject; summaries include both counts. No selection
produces engine-owned **Not configured**, contributes no healthy check and emits
no problem/recovery email. Add that neutral state to the relevant projections,
filters, history serialization and shared presentation explicitly; do not disguise
it as healthy, disabled or an execution error. Global Off still means disabled.

## Limits and completeness

Initial release ceilings, to be proven with worst-case fixtures in the first batch:

| Item | Ceiling |
| --- | --- |
| Collections | 4 per package |
| Discovered entries | 512 total per server/installation snapshot |
| Selected entries / evaluated subjects | 64 total per server/installation |
| Resource key | 255 UTF-8 bytes; label/description each 256 UTF-8 bytes |
| Inventory envelope | 256 KiB |
| Package observation | 128 KiB |
| SDK 2 remembered state | 64 KiB; SDK 1 remains 16 KiB |
| SDK 2 pure context / evaluation output | 512 KiB each |
| SDK 2 broker aggregate output | 512 KiB, at most 64 calls |
| Agent result / supervisor outer envelope | At most 1 MiB including identities and framing |
| UI page | 10 rows, with total and shared pagination |

The byte limit may be reached before the row limit. The broker and package must
report a partial inventory explicitly. UI pagination only pages the stored snapshot;
it cannot imply that uncollected rows exist. Preserve exact counts only when known.
Selected-resource status reads run independently of discovery and cover all saved
targets even when the discoverable list exceeds its limits. No unbounded retry,
silent row slicing, or widening of unrelated SDK 1 limits is permitted. Document
limits and a visible partial-discovery state; supporting larger inventories is a
later contract change, not a false claim of complete enumeration.

Check every boundary: host subprocess capture, broker frame, SDK pipe, collector
output, pure launcher input, result queue, HTTP body, admission, JSONB and UI reads.
Split data into bounded batches within one invocation where necessary. Retain
existing wall/CPU/memory/PID enforcement and independent heartbeat scheduling.

## Inventory persistence and selection

Create additive generic storage for the **latest** inventory snapshot per host,
installation and collection, with observation ID, capture/receive times, source
digest, agent generation, completeness and safe failure reason. Replace snapshots
only with newer accepted results under the same authority checks as health. A
failed refresh keeps prior entries visibly stale; it does not replace them with an
apparently complete empty list. Explicit empty success is distinct from failure.

Proposed additive storage (migration numbers are allocated at implementation):

| Table / extension | Required data and indexes |
| --- | --- |
| `skill_resource_inventories` | Unique host/installation/collection; snapshot UUID, observation ID/sequence, source digest, agent/generation, capture/receive times, completeness/reason, bounded normalized entries. |
| `skill_resource_memberships` | Host/installation/collection/key, membership UUID epoch, created/retired timestamps; unique active membership for that tuple and indexed retirement. Current count is bounded by the selected set. |
| Existing runtime-host rows | Current negotiated features and generation; old rows default to SDK 1 support only. |
| Existing history subjects/events and notification cursors/snapshots | Subject discriminator, collection/key, membership epoch and evaluation revision, nullable for existing aggregate records; uniqueness includes resource identity and existing scope. |

Use foreign keys and restricted deletion where history/outbox still refers to a
membership; prune only after the owning records permit it. Active membership and
selection settings change in one transaction. Last-known labels can be retained
for missing selected targets, but cannot become identity or proof of existence.
Keep current inventory bodies out of unbounded API aggregate/fleet responses.

Retain selected measurements under normal observation/history retention. Do not
retain a full service inventory every minute. Include the inventory in result
idempotency hashing, but persist its body only in the latest-inventory store. Delete
retired inventories with the established retention/uninstall lifecycle.

Store resource-key sets in the existing host policy's typed JSON settings. Sort and
deduplicate canonically before fingerprints/comparison; reject duplicate input
rather than silently changing the request. Empty means deliberately monitor none.
The defaults endpoint rejects nonempty host-only selections. Reset to defaults in
a host editor resets scalar overrides but **preserves resource selection**; stopping
monitoring is an explicit selection edit. Label that action Reset settings.

Selection save uses existing origin/session/Admin guards, request UUID replay and
optimistic default/policy revisions, plus the expected inventory snapshot identity.
Validate new keys against fresh selectable entries, then recheck snapshot, package
and policy authority atomically on commit. Allow retaining or removing already
selected missing/stale keys. With stale discovery, additions wait for a successful
refresh; removals remain possible. A concurrent change reports a conflict and keeps
the user's draft. Never invent arbitrary keys from a free-text field.

Read-only users can see resource results/inventory for authorized hosts; only
Admins edit selection or queue refresh. Apply the current host access gate and
completion recheck to every inventory/result/history read and count.

## Subject identity and incident continuity

Add engine-owned selection membership records, each with a stable monitoring epoch.
Use structured identities, not delimiter-joined or truncated strings:
`installation + host + agent generation + collection + resource key + membership epoch`.
Route epoch, enablement/package identity and evaluation settings scope remain
additional notification authority, as in the current engine.

- Adding B preserves A's membership epoch, incident and recovery exposure.
- Removing A retires only A; cancels unsent alerts and records monitoring stopped,
  without a recovery. Re-adding A creates a new epoch and fresh baseline.
- Renaming a display label or refreshing inventory changes no incident scope.
- Full policy revision still gates delivered evidence. While a newer selection is
  awaiting a reading, existing subjects may suspend; they do not lose their incident.
- Compute a canonical evaluation revision from effective **scalar** settings and
  relevant package identity, excluding all resource-selection arrays. A real scalar
  policy change starts a new interpretation scope; adding B does not reset A.
- Generation replacement, package/state-version change, disable/uninstall and
  removal invalidate affected pending work and remembered comparison scopes.
  New-scope current problems may alert again; none of those actions is a recovery.

Extend history/notification cursor identities with resource collection/key/epoch
fields. Existing skill/contact cursors have an explicit aggregate discriminator;
backfill without changing their event IDs or triggering historical emails. Update
uniqueness constraints, reads, cleanup and dispatch revalidation together. Separate
membership retirement from disappearance in an incomplete inventory.

Per-resource projection is the sole source for history and notifications. Existing
SMTP outbox/retries/uncertain-delivery handling and routing remain authoritative.
Use per-resource notifications for resource skills, suppressing duplicate aggregate
skill emails. Fleet keeps one aggregate skill status. History records resource
transitions and configuration/gap context, without a duplicate aggregate transition
for the same incident. Filters by skill include its resources; show the resource
name in each event and optionally narrow to one resource.

Example acceptance sequence: A fails, B fails while A stays critical, A recovers
while B stays critical, B recovers. Produce two distinct problem incidents and
their eligible recoveries. Same-state repeats produce none. An unknown/stale
reading is neither a failure nor a recovery. Retain existing sampled-observation
limitations; the feature cannot promise every transient between runs is captured.

Bound worker expansion and persistence: scan subjects in deterministic pages,
retain existing dispatch quotas, and prove fairness across hosts. Increased subject
counts can delay emails under the existing quota; UI/docs must not promise instant
delivery. Current membership is limited to 64 targets; retire old membership and
inventory rows under the 90-day lifecycle without orphaning referenced history.
Existing compact notification metadata retention is unchanged and documented.

## Generic API and UI integration

Proposed new read route:
`GET /api/v2/operator/hosts/{host}/skills/{installation}/resources/{collection}`.
It returns a versioned snapshot with freshness/completeness, saved selection,
filtered rows, page counts and current resource outcomes. Search/filter/page reads
operate on stored data and never query the host. Bound query lengths and page sizes.
Use a snapshot token so pagination cannot mix two inventories without a refresh.
If a newer snapshot replaces the requested token, return a structured conflict;
reload the list while preserving the selection draft. Do not retain arbitrarily
many snapshots merely to keep old page tokens alive.

Reuse the existing host-policy POST for settings/selection. Reuse existing manual
Run now commands for Refresh services; one ordinary collection refreshes discovery
and selected status. Show Queued/Running/Completed/Failed using that command's real
lifecycle. A successful command requires an accepted result, not an active timer.
Do not add a second scheduler, browser-triggered collector or service-specific API.

Keep the existing assignment request body and manual-run capability header. Add a
bounded `X-TinyWarden-Package-Features` header with comma-separated feature tokens,
initially `skill_resources.python313.v1`. An old app ignores the new header and
returns its existing schema 1 response. A new agent accepts that response and runs
only its SDK 1 assignments. An upgraded app returns schema 2 with explicit negotiated
features only to a requester advertising the new feature; old agents continue to
receive schema 1. Preserve the existing manual-run header/token on both paths.
Unknown tokens grant no feature; malformed/overlong header input is rejected.

Persist negotiated runtime features per agent generation and derive applicability
per installation. Advertise the new feature only after the required runtime assets
and broker probe pass. Never use only a version string or global ready boolean to
authorize SDK 2 delivery. An older agent shows Upgrade required for Services while
its SDK 1 skills keep working.

| API | Planned change |
| --- | --- |
| `POST /api/v2/agent/skill-assignments` | Negotiate schema 1/2 as above; schema 2 identifies package format and resource feature support. |
| `POST /api/v2/agent/skill-runs` | Accept schema 2 inventory only for matching SDK 2 assignments; schema 1 remains unchanged. |
| `POST /api/v2/agent/skill-run-starts` | Preserve manual command acknowledgement; test it with both negotiated formats. |
| `GET /api/v2/agent/skill-packages/{assignment}` | Existing lease/digest/permission checks; no new download path. |
| `POST /api/v2/operator/hosts/{host}/skills/{installation}` | Versioned selection arrays and expected inventory identities, guarded by existing optimistic policy counters. |
| `GET /api/v2/operator/hosts/{host}/skills/{installation}/resources/{collection}` | New generic snapshot/page read described above. |
| `POST /api/v2/operator/hosts/{host}/skills/{installation}/run` | Existing manual command, used for refresh; no separate service command. |

The schema 2 result's idempotency digest includes inventory with a new versioned
domain. SDK 1 payloads and receipt fingerprints remain byte-for-byte compatible,
including already queued retries across an upgrade. Complete closed request and
response fixtures for these paths before implementation of dependent consumers.

Map controls and responsive behavior to the
[shared Playbook resource composition](../ui/playbook.md#resource-selection-and-monitoring).
The shared renderer derives selectors from resource metadata. Add the reusable
selector to `/playbook` with fixtures before wiring Services. There is no new main
navigation item: installed package/defaults on `/skills`, server selection/results
on `/fleet/{id}`, discovery/install on `/skills/manage`, events on `/history`.

## Implementation ownership and documentation

| Area | Main implementation paths |
| --- | --- |
| Canonical SDK / admission | Agent `sdk/python/runtime/{packages,schema,outcomes,supervisor,launcher,grants,broker,worker}.py`; focused new resource modules and authoring fixtures. |
| Agent transport | Agent `internal/agent/package_{types,protocol,worker,lane,state}.go`, capability advertisement and managed runtime manifest. |
| Shared types / settings | App `lib/skills/package-types.ts`, schema/grant validators, `server/skills/settings/`, `assignments/`, `results/`. |
| Persistence / authority | Additive next-numbered migrations, DB types, `server/skills/resources/`; current package/access locks. |
| Events / delivery | `server/history/`, `server/notifications/`, shared subject projection and immutable mail snapshots. |
| UI | `components/playbook/`, `components/skills/`, existing server/Skills/History consumers; catalogue copy. |

Update package/runtime/protocol/enablement/settings/display/history/notifications/
retention/navigation docs at their implementation batches. Correct pre-existing
stale statements in touched docs (for example display described as unimplemented
and old skill source ownership). Update the canonical agent SDK/authoring docs,
asset hashes and app pinned copy together; document SDK 1/2 compatibility. Keep
Playbook guidance, public gallery and actual consumers synchronized. Record new
source ownership in each repository's map. No implementation is claimed by adding
this design document.

## Acceptance gates

1. Shared contract fixtures pass Python and TypeScript validation; v1 byte/replay
   compatibility and old-agent assignment rejection are proven.
2. Discovery/selection tests cover empty/partial/stale/failed snapshots, disappearing
   selected targets, optimistic conflicts, exact retries and forbidden host access.
3. Subject tests prove independent problems/recoveries, selection edits, policy and
   generation changes, unknown gaps, restart persistence and retention.
4. Real worker tests verify queued and completed outcomes and correct history/mail
   evidence. Timer activity is insufficient. Use capture mail for routine tests.
5. A test-only second package with synthetic resources consumes the same contract
   without source changes, skill-ID checks, routes or schema additions. It need not
   ship a Docker collector; the proof isolates reuse of the platform machinery.
6. Rendered Playbook comparisons cover desktop/mobile, every selector state,
   keyboard/touch interaction, page boundaries and permission differences.
7. Upgrade the platform with the four SDK 1 official skills still working, then
   install Services as an ordinary separately released package. Existing data and
   history remain valid; older agents show compatibility information honestly.

## Implemented read, editing and retention behavior

The read route is
`/api/v2/operator/hosts/{host}/skills/{installation}/resources/{collection}`.
It checks host access before counts/search/page processing and completes session
authorization in the read transaction. Ordinary pages have ten items. `selector=true`
returns the bounded inventory plus saved missing targets (at most 576 rows) once,
so local search/filter/paging preserves unsaved selection intent. No collection
runs from a read. No new scheduler is created.

Host policy writes include `inventory_snapshots: {collection: snapshot_id}` when
adding targets. Writes atomically recheck package, revisions, current agent and
credential, current contact, fresh complete inventory and selectable identity.
Existing targets can be retained or removed even when no longer discovered.
Global defaults hide selection fields; Reset restores scalar defaults and keeps
selected resources. Unchanged Save is disabled and quiet. Unknown mutation results
keep the exact original request for retry. A conflict requires a refreshed draft.

Latest inventory replaces older snapshots atomically with accepted current runs;
failed empty discovery retains prior visible items with explicit incomplete state.
Inventory is not historical selected evidence. The existing retention job removes
inventories older than 90 days and unreferenced retired memberships in bounded
batches. Membership rows referenced by compact history/notification metadata remain
until those references are eligible for their existing cleanup.

Event workers expand only active resource memberships and retire old subjects;
the fleet has one aggregate skill. Resource identities include collection, key,
membership UUID and scalar/content evaluation hash. Selected arrays do not change
another target's cursor. Retirement cancels pending work without recovery. Dispatch
rechecks the exact resource scope; unknown/stale/contact gaps suspend, and recovery
requires previous exposure. Resource names are escaped in history and immutable
notification snapshots. Capture proof demonstrates accepted test transport outcomes,
not real SMTP delivery.

The bounded inventory adapter spends at most 8 seconds on optional discovery,
inside the broker's outer deadline. Output/collection timeout produces explicit
partial discovery; capability, resource-budget and isolation failures remain fatal.
The selected read happens first in Services, independently of discovery contents.

### Expanded subject scan budget

History and notification capture page resource memberships in stable UUID order,
128 per server/family transaction. Each consumer, route/epoch and host has its own
small durable scan cursor. Completion and cursor advance commit together; a failed
transaction does not skip targets. Dispatch reads the exact package/resource scope
independently of the rotating capture page. Retired targets use the same bounded
scan and never produce recovery. Old scan cursors expire after 90 days of inactivity.

One Services installation with its maximum 64 selected targets fits in one capture
page. At the platform maximum of 100 resource packages and 64 targets each, a full
pass needs up to 50 package-family visits, plus existing fleet scan and delivery
latency. This is a measured transaction bound, not a promise of 60-second alerts
at that extreme. No new timer is needed.

## Acceptance evidence

The generic `example/targets` fixture installs through the normal package path and
exercises discovery, explicit selection, separate A/B incidents and recoveries. App
and agent source hashes remain identical before and after that consumer test.
Reserved PostgreSQL checks cover current/partial/stale inventory, idempotent retry,
host ACLs, global defaults isolation, membership preservation, unknown suspension,
removal/re-addition and 128-row retired-subject paging. Populated legacy evidence
and policies remain unchanged through the additive migration.

Shared selector and real editor/card browser fixtures pass 90 cases, including
exact retries, conflicts, dirty Escape, keyboard selection, read-only controls and
selection-preserving Reset. Live app checks pass at1440/1198/960/959/390/320px,
including the three requested footer removals. Screenshots were visually reviewed,
not accepted from geometry alone. Existing notification capture, runtime, native
Go runner, source/type/lint, dependency and secret gates are retained. Native app
activation completed authenticated smoke and all five jobs completed successfully.
No new service target or real service failure was created in the installation.
