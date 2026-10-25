# SDK 2 resource contract

Use `format: 2`, `sdk: 2`, runtime `python-3.13-v1` and `resource_collections` in the
manifest. Other pure entrypoints and scalar settings follow the [SDK contract](sdk.md).
SDK 2 is available in managed agent 0.0.11 and later with the resource-capable app.
SDK 3 packages declaring resource collections use the same lifecycle and payloads;
their additional compatibility requirements are in [compatibility](compatibility.md).

## Selection declaration

There are at most four collections. Each declares `selection_field`, `label_key`,
`help_key`, `max_discovered` (1–512) and `max_selected` (1–64). The selection field
is host-scoped, has resource-editor metadata and defaults to `[]`. Its schema is:

```json
{"type":"array","items":{"type":"string","minLength":1,"maxLength":255},"minItems":0,"maxItems":64}
```

Use the declared selected maximum if smaller. The runtime requires unique keys and
at most 64 selected targets total. Keys are opaque strings up to 255 UTF-8 bytes,
without controls/lone surrogates. Labels/descriptions are plain text up to 256 UTF-8
bytes. Global defaults cannot assign targets to servers.

## Collector envelope

Collect returns `{observation, resources}`. Observation matches the package schema.
Resources contains every declared collection:

```json
{"collection":"items","complete":true,"reason":null,"items":[
  {"key":"alpha","label":"Alpha","description":"Example target",
   "selectable":true,"selection_reason":null,"state":{"key":"running","params":{}}}
]}
```

Incomplete discovery needs a catalogue reason; complete is true exactly when that
reason is null. An ineligible item needs a selection reason. State is a catalogue
message, independent of its opaque identity and health result. Discovery totals
at most 512 entries. Always read selected targets separately from bounded discovery.

## Reduction, subjects and incidents

Context includes `resource_epochs[collection][key]` and `evaluation_revision`.
Epoch identifies selected membership; unrelated additions preserve it, removal and
readdition replace it. Evaluation revision changes with content/scalar settings,
excluding selection arrays. Scope remembered confirmation data to these identities.

Evaluate returns 1–8 timeline entries starting at now, ordered before evidence expiry.
Each has `from`, `subjects`, `facts`. Each subject has `collection`, `key`, `status`,
`reason`, `facts`, covering exactly the selected targets without duplicates, omissions
or extra outcomes. Subject status is healthy/warning/critical/unknown.

The engine aggregates critical > warning > unknown > healthy. Empty selection is
Not configured. Per-resource incidents are independent; aggregate changes do not
create duplicate resource alerts. Removing a target ends its monitoring without
claiming recovery. Read failures/partial discovery cannot imply successful recovery.

The selector defaults to monitorable items. Show all states reveals other entries;
Monitored only includes retained unavailable selections. Search/state quick filters
change only the view, never the selected set. New selections require current
eligible inventory. Saved missing selections can be retained or removed.

## Budgets

| SDK 2 payload | Maximum |
| --- | --- |
| Discovery inventory | 256 KiB |
| Selected observation | 128 KiB |
| Reducer state | 64 KiB |
| Pure execution input/output | 512 KiB |
| Broker aggregate/calls | 512 KiB / 64 |
| Outer transport | 1 MiB |

Negotiation uses `skill_resources.python313.v1`; package polling echoes negotiated
support and delivers schema 2/package format where supported. Old agents continue
receiving SDK 1; unsupported SDK 2 assignments remain unavailable rather than being
silently downgraded. Manual-run negotiation is independent.

See the [runnable guide](../../build-skills/resources.md),
[resource validator](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/contracts/resources.py)
and [service adapter](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/host/systemd_services.py).
