# Services skill

Status: implemented and accepted, 2026-10-18. Services 1.0.0 uses the activated
resource platform and managed agent 0.0.11 or later. Installation and enablement
leave all monitored selections empty until an administrator saves targets.

## Product contract

One official skill, `tinywarden/services`, runs inside the existing agent. Each
server has its own explicit list of services that should remain running. It
discovers names/descriptions/state, offers a shared searchable selector, monitors
the saved selection and produces an independent incident for each service.

The first release supports **system-manager systemd services on Debian 13 amd64**,
matching the currently verified agent platform. It does not claim coverage of
per-user systemd managers, Docker container state, Windows services, scheduled job
completion or application response checks. Those can become future skills using
the same resource platform where appropriate. A running systemd unit is evidence
about service state, not proof that a website or database answers requests.

Discovery starts when the skill is installed, approved and enabled. No service
starts monitored automatically. Newly discovered services remain unselected;
installing this skill cannot turn every server into a set of false failures.

## Server and dashboard presentation

The server card shows the **Monitored services** summary first, followed by the
**Monitored resources** table and History. The shared package card uses this order
for resource skills. The server page has no bottom Data as of/Refresh explanatory
footer; its normal background polling and freshness handling continue.

Under Customize dashboard → Services, **Services health** adds one compact overall
row status to the selected table columns and attention/unknown card fields. It
exposes no service names, counts or reasons. This is a reusable platform health
option, independent of package display declarations; Services stays at 1.0.0.
Empty selections remain Not configured, and stale/ineligible observations cannot
turn into a Healthy result. See [dashboard customization](dashboard.md).

Monitored resources uses the same unboxed Playbook 3.2 row status for each service;
the Services section header retains its primary boxed status. Both use current
engine health and preserve Unknown/freshness behavior.

## Package and settings

Source belongs in `tinywarden-skills/skills/services/`; no service-specific package
code goes into the app or compiled agent. Package version `1.0.0` uses package
format 2 / SDK 2, supported by managed agent `0.0.11`. The catalogue publishes the
package only after a compatible platform is available.

| Setting | Default | Scope / meaning |
| --- | --- | --- |
| `monitored_services` | `[]` | Host-only set of canonical service keys, at most 64. |
| `interval_seconds` | 60 | Inheritable scalar, 60–86400 seconds; 60 is recommended. |
| `alert_after_seconds` | 60 | Inheritable scalar, 0–3600 seconds of observed unhealthy evidence. Zero explicitly requests first-observation alerts. |
| `startup_grace_seconds` | 120 | Inheritable scalar, 0–600 seconds after server boot. |

Positive alert delay requires at least two distinct fresh observations, separated
by that delay, within the same boot and monitoring scope. Actual notification
latency includes collection cadence, transport and notification dispatch; the UI
must not promise delivery precisely after the configured delay. Discovery runs
with each normal collection initially. Reuse Run now to refresh it; optimize
discovery cadence later only if measured overhead justifies additional caching.

Global defaults on `/skills` expose only scalar settings. Selection is edited on
the relevant `/fleet/{id}` page and cannot leak into defaults for other servers.
Reset settings preserves the selection. Selection is saved explicitly, with
unsaved-change protection and conflict/retry behavior from the shared editor.

### Filter services without changing monitoring

The shared selector initially lists only monitorable services. Use Show all states
to include Review/Missing and other unavailable types. The quick selector lists
every available state; choose one or All states for the combined view. There is
no separate States dropdown or multi-state subset. Monitored only combines with state/search filters
and includes selected services even if they become unsupported or disappear.
Filtering never starts/stops services or edits the saved monitoring selection.

## Read-only systemd capability

Add two reviewed broker operations in the canonical agent SDK:

- `systemd.services.list`: enumerate installed service unit files and loaded
  service instances, including inactive units. Return bounded normalized identity,
  description, basic state, type/trigger classification and completeness.
- `systemd.services.read`: query exact requested service identities in bounded
  batches, returning an explicit result for every requested name. Selected targets
  are checked even when absent from or beyond the discovery snapshot.

Both operate only on the system manager, within the existing runtime's UID and
OS permissions. The grant review says that the skill can list system services and
read their states. Package request, exact-digest Admin approval and local ceiling
must all permit each operation. Discovery is broader than the monitored selection;
the selection defines monitoring intent, not a hidden permission grant.
Document any necessary local-ceiling change explicitly. Installing a new package
or upgrading the runtime cannot silently widen a locally restricted ceiling.

Use a dedicated trusted adapter with fixed arguments/methods and a fixed property
allowlist. Prefer the existing supervised `systemctl` route, using parseable list
output and `show` for named properties. Freeze real Debian 13 fixtures before
choosing the exact invocation/parser; if reliable bounded enumeration cannot be
proved, implement the same narrow adapter through the documented systemd bus API.
That choice does not alter the skill or generic resource contract. Do not expose
arbitrary bus methods, shell commands, journal output, environment variables,
ExecStart arguments, unit-file contents or start/stop/restart actions.

The observation allowlist covers canonical identity/aliases, description,
LoadState, ActiveState, SubState, UnitFileState, Type, RemainAfterExit, TriggeredBy
and failure result/code. Return bounded boot identity/uptime for grace calculation.
Descriptions may be shortened with an explicit display indicator; identity must
never be truncated. Validate canonical systemd names, including valid escaped
instances; separate options from operands and never interpret names as globs.

Systemd's loaded-unit listing does not enumerate every installed service, and
templates are not runnable instances. Combine installed and loaded inventories;
deduplicate aliases to the resolved canonical `Id`. Persist that key. Template
instances such as `example@worker.service` are distinct targets; the bare
`example@.service` template cannot be selected. These distinctions come from the
[systemctl interface](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html).

The adapter owns safe parsing and bounded observations; package code owns the
eligibility and health interpretation. Alias/canonical identity changes never
silently transfer a selection to a different target. Preserve the prior selected
key with a visible review/missing state when identity cannot be resolved reliably.

## Eligibility and state interpretation

The initial policy is **must remain running**. The discovered list can show other
service types with an explanation, but they cannot be newly selected for this
policy. In particular, a oneshot can successfully finish or remain active without
a running process; socket/timer/path-triggered units can intentionally be idle.
See the [service type semantics](https://manpages.debian.org/trixie/systemd/systemd.service.5.en.html)
and [systemd properties](https://manpages.debian.org/trixie/systemd/org.freedesktop.systemd1.5.en.html).

| Observation | UI state and monitoring decision |
| --- | --- |
| Eligible long-running unit, loaded and active/running | Running; healthy. |
| Known running unit reloading | Reloading; preserve healthy when its documented state demonstrates continued service operation. |
| Inactive/dead | Stopped; begin/continue alert grace, then critical. |
| Failed | Failed; begin/continue alert grace, then critical. |
| Activating/deactivating/auto-restart | Starting/Stopping/Restarting; pending during grace, critical if repeatedly observed beyond grace. |
| Exact selected unit confirmed not found | Missing; grace then critical; retain selection. |
| Selected service masked or invalid configuration | Visible explicit problem; grace then critical. |
| Enabled-at-boot changed, runtime remains running | Startup metadata changes; health does not change merely because of enablement. |
| New oneshot, RemainAfterExit, bare template or on-demand trigger | Informational row with explanation; cannot select under the initial continuous-running policy. |
| Selected unit changes to an unsupported type/ambiguous identity | Unknown / Needs review, preserving selection; never silently healthy or removed. |
| Access denied, unsupported state, malformed/partial selected result | Unknown; no inferred stopped/missing status. |
| Expired observation, offline agent, no usable runtime | Engine Unknown/Stale/Offline handling dominates package claims. |

Unselected services do not affect health or generate alerts, including failed
unselected units. Listing all failed units is not a monitoring policy.

## Grace and remembered state

Persist only compact per-selected-target state: monitoring epoch, boot identity,
last accepted observation time, first observed unhealthy time and its type, last
definitive evaluation and relevant scalar-policy fingerprint. Use supplied captured
times and validated boot uptime; do not trust a Python guest wall clock.

1. A fresh Running result clears pending failure and evaluates healthy.
2. First unhealthy observation displays its real raw state with Checking before
   alerting, evaluates unknown while pending, and starts the delay.
3. A later distinct unhealthy observation confirms critical only when the delay
   has elapsed and boot startup grace has ended. Zero alert delay allows a first
   observation once startup grace has ended.
4. Grace cannot advance solely because a UI or timer reads an old observation.
   Repeated delivery of one run does not count as another observation.
5. Boot change, backwards time, evidence gap or monitoring-epoch change resets
   pending evidence. An existing exposed incident remains suspended across an
   unknown gap until fresh evidence establishes its state; that is not recovery.
6. A successful fresh Running observation ends the incident, even if other services
   are still down. Recovery email follows the existing exposure/recovery settings.

Within a continuous unhealthy period, changes such as Stopped → Failed do not
restart the delay indefinitely. Startup grace only suppresses boot-related
qualification for its bounded window; it does not make an unhealthy reading green.
Intentional stopping while still selected has the same meaning as any other stop.
Removing the target ends monitoring explicitly, without a recovery event.

Report **first observed** failure time rather than an exact crash time. A service
that stops and restarts between observations may be missed. V1 samples state;
an event subscription or restart-loop detector is a separate future enhancement.

## Display and interaction

Use the [shared Playbook mapping](../ui/playbook.md#resource-selection-and-monitoring)
for every control and state.

- The server's Services card shows a count summary and a table of monitored
  services with their current state. Critical and unknown counts can coexist.
- Admin **Settings** opens the existing settings dialog with scalar
  settings plus the reusable resource selector. **Refresh resources** queues the
  existing Run now operation; its completion must be a newly accepted reading.
- Selector columns: **Resource**, **State**, **Monitor**. Name is primary;
  description is secondary and wraps. Startup metadata/eligibility explanations
  belong in details/help, not a wide extra column by default.
- Search and **All / Monitored** filters are scoped to this server. Paging and
  filtering never discard selections or saved missing targets. Checkboxes edit a
  draft; Save applies the set. Refresh preserves the draft and marks conflicts.
- No selection shows **No resources selected** with the Admin action. Read-only
  users see the same honest neutral result without mutation controls.
- Empty search, no discovered services, first reading, offline/stale inventory,
  partial discovery, capability unavailable, refresh failure and limit reached
  have distinct shared states. Avoid a misleading “all services” total on a partial
  inventory. Existing selected services remain visible even if absent from it.
- History entries and emails identify server, Services and exact service name.
  Dashboard still has one Services result, not a widget per selected service.

Use `display.json` and catalogue text for the package-owned monitored table/facts.
The editable selector is app-owned metadata-driven UI, not an interactive widget
shipped inside the ZIP. No custom chart is required for the first release.

## Alert and history acceptance

Reuse the resource platform's per-subject cursors and existing delivery route.
Test A-down → B-down → A-up → B-up independently while aggregate severity can stay
critical. Do not send an extra aggregate email for those resource incidents.
Notification snapshots contain the resource name, sampled time and a short safe
reason. Existing uncertain SMTP outcome handling, quotas and dispatch revalidation
remain in force. A captured message is not claimed to be real delivered email.

Preserve independent timelines when unrelated selections change. Deselect/reselect,
global disable, package update, account access revocation and agent replacement
must invalidate the right pending work. History explains monitoring changes/gaps;
it must not invent service recovery when observation or authority disappears.

## Packaging, release and operational proof

Include manifest, bounded settings/observation/state schemas, collector/reducer,
display and notification descriptors, English catalogue, README/license, fixtures
and package tests. Add a catalogue row and ordinary versioned ZIP only after
platform compatibility, digest/grant review and acceptance are complete. A schema
change for every service or a separate package per service is forbidden.

Acceptance uses disposable systemd fixtures in the established Debian test VM:
running, stopped, failure, slow start, restart, alias, escaped instance, missing,
masked, oneshot, socket activation, permission failure, systemd unavailable and
inventory overflow. Do not stop SSH, databases, TinyWarden or actual user services
to demonstrate alerts. Test real broker access as the deployed unprivileged agent
and measure runtime/resource use with the maximum selection and inventory.

Prove selection survives agent restart, transport retry and app restart. Prove
offline causes one existing host incident while services become unknown. Validate
native history/notification job completion against actual cursor/event/outbox
results. Compare accepted Playbook desktop/mobile screenshots, not just overflow.

Roll out additive app/schema/pinned SDK and compatible native jobs, then compatible
agent runtime/binary, then import/enable Services through normal package review.
Use capability gating throughout mixed-version rollout. Existing four skills must
continue collecting and alerting. First live install has an empty selection; let
the owner select real production targets. Disabling Services is the first recovery
action for a feature defect. Do not roll the web back to a version that cannot
read the selected SDK 2 package/new subject states while its jobs remain active.

## Included page cleanup

Include these already requested removals in the UI batch:

| Page | Remove |
| --- | --- |
| `/dashboard` | Bottom Updated/continuous-history explanatory footer in `app/dashboard/_components/fleet-client.tsx`. |
| `/history` | Bottom retention/sampled-observation/capture-start footer in `app/history/history-results.tsx`. |
| `/skills` | Delivery/defaults explanatory paragraph in `app/skills/_components/package-settings.tsx`. |

Remove unused styles/catalogue entries only after reference checks. These are
presentation removals: preserve retention, timestamps, history behavior and the
settings delivery contract. Keep detailed operational explanations in documentation
and relevant targeted details/help. Do not remove the dashboard's active history
capture warning or refresh control. These presentation removals are implemented.

## Verified first-release scope

Seven policy/collector unit tests and twelve captured-observation sandbox cases
cover running/reloading, initial stops, confirmed failures, startup/unknown/gaps,
changed membership, missing services and bounded inventory. The real Debian VM
check ran as the installed `tinywarden-agent` UID and used disposable running,
stopped, failed, oneshot, socket-activated and missing units. It also kept all64
selected services observable with512 extra discovery fixtures. Discovery reported
its truncation explicitly; it was not mistaken for missing selected services.
The zero-delay VM check and captured positive-delay fixtures are separate proofs.
All disposable units and temporary runtime copies were removed. No actual user
service was stopped and no real SMTP delivery is claimed by capture tests.

The four earlier package entries and ZIP hashes remain unchanged. The Services
ZIP is published before its catalogue entry. Release builds use the exact published
SDK commit and hashes in SDK.lock.json; the source SDK override is only a
development path. See the skills repository's publishing guide for that sequence.
