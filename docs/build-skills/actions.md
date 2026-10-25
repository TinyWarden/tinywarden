# Add actions to a skill

An action lets an explicitly authorized skill perform a reviewed operation on a
server. Keep the operation's behavior, native adapters and tests in the skill
package. The platform owns delivery, permissions, approvals, supervision and
recovery. A compatible action addition uses a new package release.

## Required support

The source SDK supports format/sdk3 action metadata and authoring. Published SDKs
that accept only formats1/2, including the SDK used by agent0.0.20, cannot admit
these packages. Host execution additionally requires the negotiated
`skill_actions.v1` capability. Check the selected SDK and installed hosts before
selecting a format3 package; metadata admission alone does not enable execution.

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

For native acceptance, install a supported candidate platform on a designated
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

The candidate Updates package's
[Refresh source](https://github.com/TinyWarden/tinywarden-skills/blob/main/skills/package-updates/actions/refresh.py)
shows a separate action alongside an existing monitor. Preparation is read-only;
`apply` checks the shared start authorization immediately before launching its
fixed operation. The package saves a durable receipt using `context.state_fd`
and verifies that same receipt. Its inspector holds native locks while calling
`context.commit`, which lets the platform record recovery evidence before the
locks are released. An uncertain or failed action is never repeated by inspection.

The package owns repository policy, native execution and result facts. The shared
runtime owns artifact identity, permission checks, process supervision and transport.
This source example needs the SDK3/action-capable candidate platform described
above; it is not supported by released agent0.0.20.

The candidate Updates package also demonstrates an explicitly approved
[Conservative upgrade](https://github.com/TinyWarden/tinywarden-skills/blob/main/skills/package-updates/actions/upgrade.py).
Its package-owned schemas declare the package/version review table, summary facts
and result/recovery values. The native adapter retains package/archive locks through
its final plan/input comparison and `context.check_start()` before one transaction.
A durable private receipt records the start and observed completion; verification
compares saved package state and selections. Inspection reports saved outcomes
under native locks and never repeats installation. Inspection receives no original
plan, so its receipt must independently identify the job and pinned package. These
are candidate examples; they do not imply released-agent support or action permission.
