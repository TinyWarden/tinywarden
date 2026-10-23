# Notification Details

Optional `notifications.json` declares a translated Details paragraph from accepted
assessment evidence. The platform owns triggers, severity, recipients, headers,
identity and navigation. This descriptor cannot send messages or add links/HTML.
Missing or invalid data retains the generic notification fallback.

Use `format: 1` and 1–32 rules, within 16 KiB and depth eight. Each rule has `reason`,
`states`, `message_key`, `parameters` and optional `marks`. Reason names an existing
catalogue reason; states are unique healthy/warning/critical values. A reason/state
pair may match only once. Message placeholders must have exactly matching typed
parameter bindings.

A binding has `source` and optional `marks`, `precision` or `plural`. Sources are:

| Source | Form |
| --- | --- |
| Assessment reason parameter | `{"reason_param":"name"}` |
| Scalar fact | `{"fact":"used","type":"number"}` |
| Effective setting | `{"setting":"warning_percent"}` |
| Parameter-free catalogue text | `{"catalog_key":"label"}` |

Source/destination types must agree. Numeric precision is 0–3. Plural formatting
uses `one_key`/`other_key` messages with numeric `count`, producing a string; it
cannot be combined with precision. Allowed marks are bold, italic and underline,
with no duplicates. The app escapes text and owns inline rendering. URI-like text,
control/bidi characters and arbitrary markup are rejected or fall back safely.

The [memory example](https://github.com/TinyWarden/tinywarden-agent/blob/main/examples/skills/memory-pressure/notifications.json)
contains complete warning/critical rules. Bindings use immutable accepted evidence
and its effective settings, not later values. Resource notifications identify the
selected target; target scope/history remains platform-owned.

The [JSON schema](../../architecture/skill-notification-details.schema.json) checks
syntax. Cross-file catalogue/type rules are enforced by the
[SDK inspector](https://github.com/TinyWarden/tinywarden-agent/blob/main/sdk/python/runtime/contracts/notifications.py).
Testing a descriptor does not authorize real email delivery.
