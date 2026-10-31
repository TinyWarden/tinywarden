# Add actions to a skill

An action lets an explicitly authorized skill perform a reviewed operation on a
server. Keep the operation's behavior, native adapters and tests in the skill
package. The platform owns delivery, permissions, approvals, supervision and
recovery. A compatible action addition uses a new package release.

## Required support

The published SDK pinned by the official skills repository supports format/sdk 3
action metadata and authoring. For managed execution, use agent 0.0.22 or later
with a compatible app. SDK 3 monitoring requires `skill_packages.sdk3.v1`;
execution additionally requires `skill_actions.v1`, exact action permission and
local execution policy. Older SDK 1/2 runtimes, including agent 0.0.20, cannot admit
format 3. Check [compatibility](../reference/skills/compatibility.md) before selecting
a package; metadata admission alone does not enable execution.

## Create an inert example

Use a verified SDK kit that supports format3. Follow the
[quickstart](quickstart.md) for SDK prerequisites and the `tw_sdk_root` variable:

```sh
python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" init "$PWD/../acme-actions" \
  --id acme/example-actions --publisher Acme --with-actions
python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" validate "$PWD/../acme-actions"
```

The example retains its memory monitor and adds an inert action under `actions/`.
It changes no host state. Validation reports action IDs, execution classes and
descriptor digests without importing either module. Edit its identity, catalogue,
README, schemas and action source for your use case before publishing.

## Declare the operation

Add an optional `actions` array to the existing package's format3 manifest. Every
entry declares a stable ID/version, catalogue names/help, execution class,
preparation effects, approval and monitoring requirements, fixed Python entrypoint,
prerequisites and input/plan/result/recovery schemas. The same package can keep
monitoring without granting action authority. See the exact
[action contract](../reference/skills/actions.md).

Declare review facts and tables using schema properties and catalogue labels.
Table sources must be required nonnullable arrays of nonnullable objects. Use an
empty array when there are no rows; nullable scalar columns can represent unknown
values. Validation rejects optional or nullable table bindings before publication.
The app supplies shared components, pagination and responsive layout. Package
code does not supply browser code, SQL or custom renderers.

## Show actions on server pages and in Fleet

The app also supplies saved-operation receipts and **Operations → Recent results**
for every action-capable skill. Authors do not add history callbacks, placement
flags, SDK methods or agent changes. Names and result fields come from the saved
operation's skill version; updating or revoking an action does not rewrite its
retained results. The app distinguishes running work, approval review, completed
results and verification-required outcomes and keeps links after page refresh.
Finished notices can be dismissed as an account-scoped display preference shared across devices.
The app keeps their saved results accessible, shows new/changed results and never
allows this control to hide running, approval or verification states. Skills do not
implement dismissal callbacks or gain command/recovery authority through this UI.
Result access follows the existing administrator role and retention policy;
viewing an old result never grants permission to run that action again.

The app discovers actions from the selected package's existing `actions` array.
After installation and explicit action permission, eligible actions appear as
items in that skill's **Operations** menu beside **Check now** and **Settings** on
each server page. No placement flag, app
registration, custom renderer or agent/SDK change is required. The same component
supports zero, one or many actions, preserves declaration order and wraps long
menu labels. Actions belong to the exact installation, even when names match another
skill. Item labels and descriptions use the catalogue keys shown below.

An administrator can also open a server's **Manage server → Skill actions…**,
or select servers and open
**More actions → Skill actions…**. The picker groups available actions by skill.
Selecting a parameterless row action starts preparation immediately for that
server. Server-page menu choices follow this same behavior. `requires_approval: true`
still requires explicit approval of the prepared plan before application. Actions with inputs and all bulk selections retain input
and target review.

A server-page action with inputs reviews those inputs for that one server. Both
entry points share the same launch, saved request identity, plan approval and
progress/recovery screens. A running action provides **View progress** in its
owning skill section and Fleet row; failed/stale discovery omits launch choices.
On the server page, opening Operations retries an unconfirmed availability read.
If it still fails, the app supplies **Retry loading actions** with an explanation;
this reads current availability without starting a task. Saved-result dismissal
does not affect action discovery or permissions.
If the current server response marks every declared action unavailable, the app
shows the readiness reason and **Check action availability** instead of launch items.
The independent **Check now** control requests a monitoring collection, not an
action. Action availability never grants execution authority on its own.

| What the reader sees | What the author declares |
| --- | --- |
| Skill heading | Manifest `name_key`, resolved in `messages/en.json` |
| Action name | Action `name_key`, resolved in the same catalogue |
| Action explanation | Action `description_key`, resolved in that catalogue |
| Input, review and result screens | The action's existing schemas and presentation bindings |

Use clear, nonempty skill and action names. The SDK accepts blank catalogue text,
but the picker omits actions whose skill or action name is empty or whitespace.
Other actions and Fleet controls remain available. The app sorts skill groups by their
display names and preserves action declaration order within each group. Distinct
installations remain distinct even when their labels match; canonical skill IDs
disambiguate equal group names. Counts beside an action show partial bulk
eligibility. The preparation screen names affected and skipped servers.

For a working inert example, first create the starter above with `--with-actions`.
From the same authoring directory, change only its catalogue labels:

```sh
tw_action_dir="$PWD/../acme-actions"
python3.13 - "$tw_action_dir" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1]) / "messages/en.json"
catalogue = json.loads(path.read_text(encoding="utf-8"))
catalogue["name"]["text"] = "Example checks"
catalogue["action.name"]["text"] = "Check example input"
catalogue["action.description"]["text"] = (
    "Check the supplied example input without changing the server."
)
path.write_text(json.dumps(catalogue, indent=2) + "\n", encoding="utf-8")
PY
python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" validate "$tw_action_dir"
python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" pack "$tw_action_dir" \
  --output "$PWD/../acme-actions.zip"
```

The generated manifest already connects `name`, `action.name` and
`action.description` to these labels. Keep its inert entrypoint and schemas while
learning the workflow. Run the captured cases described below, then follow
[publishing](publishing.md) to publish a new immutable ZIP and catalogue entry.
Executable actions require a repository installation with a verified publisher
origin; an uploaded ZIP alone does not establish that authority. Select the skill
in the app, allow its exact action version and configure the server's separate local
publisher/execution policy. With fresh readiness, the picker shows **Example checks
→ Check example input**. The example remains inert and has no domain operation.

To add another item, declare another action with its own stable ID, labels,
entrypoint and schemas. Test and publish the changed package under a new version,
then explicitly review its action permissions again. A compatible action addition
needs no menu registration, app renderer or host-agent update. Menu placement is
owned by the app: the individual and bulk Fleet pickers and server skill-card
Operations menus reuse the same declarations and permissions. Packages cannot inject
entries into other menus or ship browser code.

If an item is absent, check the exact selected version's action permission, skill
enablement, verified origin, compatible recognized agent, local policy and fresh
prerequisite report. Monitoring permission does not authorize actions. Conflicting
work, archived servers or paused monitoring for an action that requires it can
also make an action unavailable. On a server, inspect **Agent settings → Maintenance
actions** for readiness; the picker omits unavailable choices. See the
[action reference](../reference/skills/actions.md#fleet-action-discovery).

## Test and package

The starter includes `action-tests.json`. The existing `test` command runs monitor
cases through the isolated SDK and validates captured action values. An explicit
`--action-cases FILE` selects another captured-value document. These schema checks
execute no action code and cannot establish native transaction safety. Test actual
operations, lock contention, interruption and recovery on a designated disposable
host before requesting administrator trust.

Use the normal `validate` and `pack` commands. Action source, schemas, catalogue,
fixtures and README all contribute to the immutable content digest. A change
requires a new version. `collect` continues to invoke only the read-only monitor;
approving its declared grants never authorizes an action.

For native acceptance, install a compatible released platform on a designated
disposable host, configure the explicit local publisher/class ceiling, import the
package and allow its exact action digest. Start from Fleet and inspect the saved
plan/result and private receipt. Exercise refusal, interruption and read-only
inspection as well as success. Then freeze the app/agent/runtime artifacts, update
only the skill and repeat. A compatible package must not need an app renderer,
agent branch or hidden registry entry. Keep existing monitors, settings and history
working when action permission is absent.

The public [entry point and context contract](../reference/skills/actions.md#python-action-entry-points)
defines phase arguments, exact return fields, structured failures and commit/start
boundaries. Use the job workspace for domain receipts; do not write into monitoring
state or invent a second platform job queue. Publish the immutable archive before
its catalogue entry, then review the new version's action permission explicitly.

## Report useful progress

Use the shared [operation logging API](../reference/skills/actions.md#operation-logging)
to describe real steps in any action phase. Add a message to the package catalogue:

```json
{"action.checking":{"text":"Checking the selected items.","parameters":{}}}
```

Then, inside the action entry point:

```python
writer = getattr(context, "log", None)
if writer is not None:
    writer({"key": "action.checking", "params": {}})
```

Agent 0.0.25+ provides the method. This optional form keeps the same action usable
on older compatible runtimes. It records to a bounded private job log; its return
value does not confirm remote delivery. Use concise catalogue messages for steps
that actually started or completed. Never use logging for receipts, approval,
execution fencing or retries, and keep credentials/private host output out of it.
An expected refusal still uses `ActionFailure` with a declared reason and facts.

The app supplies one **Execution log**, collapsed until the user opens it, using
the shared Full transcript renderer,
with **Copy** and **Download** in individual progress and bulk result details.
Agent 0.0.26 adds the optional `context.output(text, stream="stdout")` API:

```python
import shlex
import subprocess

argv = ["/usr/bin/example-tool", "--check"]
writer = getattr(context, "output", None)
if writer is not None:
    writer(shlex.join(argv), stream="command")
result = subprocess.run(argv, check=False)  # Runtime captures inherited streams.
if writer is not None:
    writer(str(result.returncode), stream="exit")
```

For redirected text pipes, tee their bytes to stdout/stderr or call the same writer
with `stream="stdout"`/`"stderr"`. Binary archive streams are not console text.
Do not redirect useful errors to `DEVNULL`. Native library calls should report their
real output/errors; they have no invented CLI command or process exit code.

Use `context.log` for catalogue messages and `context.output` for actual text. The
runtime records unexpected tracebacks without locals, removes terminal controls
and redacts common credential patterns. Avoid printing secrets. Capture is bounded
and best effort: never decide execution, approval, verification or retries from a
logging return value. Old operations cannot acquire missing historical output.
Read the full [SDK/HTTP contract](../reference/skills/actions.md#operation-logging)
for stream names,1024-record/1MiB bounds, truncation, authority and compatibility.

Publish changed package source/README bytes as a new immutable skill version and
review its action grants again. No custom renderer, menu or per-skill agent
registration is required. Native acceptance should prove real output delivery and
failed/absent diagnostics without repeating a native transaction.

## Elevated trust

An action that changes OS packages requires administrator-trusted root code,
including package maintainer scripts. A signature or verified repository identifies
the bytes and publisher; it cannot sandbox malicious root code. Use separate
exact-package action authorization, the host's local execution policy and explicit
transaction approval. A package update cannot silently carry elevated approval to
new bytes. Preserve pending work and its pinned package until recovery settles.

## Input labels and permission review

Use `label_key` and optional `help_key` on input schema properties to name controls
from your message catalogue. The app renders bounded objects, arrays, optional and
nullable fields, enums and scalar inputs through shared controls. No custom frontend
code or renderer is shipped by a skill.

An administrator reviews the exact package version before allowing an action.
The host separately allows the verified repository publisher and execution class.
Updating the package does not extend the previous action approval to the new bytes.
Keep monitoring useful without action permission, and test the denied case.

## Package-owned execution example

The [Package updates skill](https://github.com/TinyWarden/tinywarden-skills/blob/main/skills/package-updates/README.md)'s
[Refresh source](https://github.com/TinyWarden/tinywarden-skills/blob/main/skills/package-updates/actions/refresh.py)
shows a separate action alongside an existing monitor. Preparation is read-only;
`apply` checks the shared start authorization immediately before launching its
fixed operation. The package saves a durable receipt using `context.state_fd`
and verifies that same receipt and the recorded native command exits. Refresh's
summary and Upgrade's preview use the same fixed plain-upgrade options, independent
of monitoring settings and broader APT defaults. Its inspector reads the saved
receipt and calls `context.commit` with the outcome it can establish. Missing or
running receipts remain uncertain. Inspection never repeats an action.

The package owns repository policy, native execution and result facts. The shared
runtime owns artifact identity, permission checks, process supervision and transport.
Use the SDK 3/action-capable platform and explicit authorization described above.

The same Updates package also demonstrates an explicitly approved
[Upgrade packages](https://github.com/TinyWarden/tinywarden-skills/blob/main/skills/package-updates/actions/upgrade.py).
Its package-owned schemas declare the package/version preview table, summary facts
and result/recovery values. One approval authorizes ordinary `apt-get upgrade`
under the displayed command policy; APT resolves the packages when that command
runs. The preview does not freeze archives or package versions. The action checks
`context.check_start()` immediately before starting and saves a private running
receipt before invoking APT, which acquires its own native package locks. The
terminal receipt records the observed exit; verification compares that receipt
with the reported result. A nonzero exit can include partial changes.

Inspection receives no original plan, so its receipt must independently identify
the job and pinned package. The generic runtime verifies retained identity and
worker exclusion under its mutation guard; it does not audit APT or infer success
from a missing receipt. If another action needs domain locks to inspect its state,
that action must acquire them and hold them through `context.commit`. Installing
a package does not itself grant action permission.


## Immediate actions and progress

The app starts a row action on the first selection when its admitted descriptor has
an empty object input schema (no properties). No menu
extension or frontend code is needed. The server row is the entire target scope;
other checked rows cannot be included. Actions with inputs retain input review. Approval actions show their prepared
review inline and require **Approve and run** before applying changes. Bulk actions always retain explicit target review.

Provide useful typed `result_facts` for the completion view. The app renders a
compact single-server progress/review/result dialog, and exposes **View progress** in the row and menu while work is active or
needs attention. Closing the dialog does not cancel execution. Results remain in
Fleet Activity. Repeated clicks and uncertain network responses reuse the saved
request identity instead of creating another job.

The same window covers startup, waiting, execution and completion. Its action name
and server stay in place; status and result values update quietly. Declared
`result_facts` become compact label/value rows, in descriptor order. Pending rows
show a dash, while reported zero and false values remain meaningful. Supply concise
labels and typed values; the app does not inspect an action ID to choose this layout.
Existing recovery controls live under **Troubleshooting**. Result metadata affects
presentation only and never authorizes execution. No extra manifest field, agent
endpoint, SDK call or skill UI code is needed for this presentation.

Declare `verification: "local"` and verify your own durable receipt, or omit the
field for the same application default. Explicit policy fields need agent 0.0.24+;
`host_health` is retired for new operations. Approval and result evidence are
separate choices. An action must work without any other installed skill. Do not
import another package or depend on its version, configuration or health. The app
aggregates monitoring health independently of operation settlement.

The Updates Refresh action demonstrates a native command plus a saved summary.
Upgrade packages demonstrates a cached preview and approval of a standard command;
it explicitly says the preview is not a frozen package transaction. These policies
belong to the skill, not the app. See the [verification contract](../reference/skills/actions.md#choosing-verification).

The existing public surfaces suffice: entry points `prepare`, `fetch`, `apply`,
`verify`, `inspect`; `context.check_start()` before mutation; private `state_fd` and
`state_path` for receipts; `context.log()`/`output()` plus inherited stdout/stderr
for diagnostics; `context.read_package()` for admitted data; and `context.commit()`
for lock-held inspection. `binding`, `scope`, `job_id` and `plan_sha256` bind evidence.
The complete signatures, invocation fields and operator/agent/recovery endpoint
inventory are in the [action reference](../reference/skills/actions.md). Native
commands use ordinary skill Python code; no new agent API or package registration
is needed.

Prompt work delivery is platform-owned. Agent 0.0.24+ holds a bounded authenticated
waiting request, then uses the ordinary job/permission protocol. Skills do not poll,
open network listeners, receive agent credentials or change the agent to add actions.

Approval actions use the same persistent title, server and footer while their
saved description and declared review facts/tables appear inline. Include the
action's effects in its description so they remain visible when a saved plan is
reopened for approval. The approval control is available only
for the current readable plan, matching its operation, host, job and digest.
Changed/expired plans require a fresh review and explicit approval. Supply readable
scalar result values as well as catalogue labels: internal receipt identifiers are
not translated by the app. Background reads preserve focus and controls; the UI
shows only actual reported phases, with no inferred percentage or timers.

## Terminal results and action availability

A known-effect, locally verified terminal result with no running process releases
new work, including when the action remains failed after verification. Its saved
outcome stays in Activity. Report uncertainty honestly: an unknown effect, active
process or pending recovery remains fenced. A `succeeded`/`no_changes` result cannot
use an unknown effect. Do not mark an uncertain failure verified just to free a
server or retry it.

The app supplies **Verification required → Verify and unlock** on server cards and
Fleet for unresolved terminal work. It opens the existing scoped read-only recovery
workflow, using the package's `inspect`/`context.commit` contract. The package does
not add frontend controls or a custom agent command. Opening that screen never
executes recovery or creates authority; inspection never repeats application.
