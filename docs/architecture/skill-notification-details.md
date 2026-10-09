# Skill notification Details v1

Status: **implemented**. App inspection and author SDK validation support this
additive package API; template 2 renders Details without running skill code.
The existing [notification lifecycle](notifications.md) continues to govern when
an alert is eligible, its recipient and delivery retries.

## Package declaration

An optional UTF-8 `notifications.json` file declares one short Details paragraph
for a skill assessment. It never creates an alert or changes its severity. The
app owns the email subject, identity, state, timestamps, recipient and server link.
New package versions are immutable; never edit an already admitted package.

The file is a closed JSON object with exactly `format: 1` and `rules`. Limit it to
16 KiB, depth eight and 1–32 rules. Reject duplicate JSON keys, unknown properties,
non-finite numbers, invalid catalog references and unsupported format values at
package admission. An absent file preserves generic notifications.

Each rule has exactly `reason`, `states`, `message_key`, `parameters`, with optional
`marks`. `reason` references an existing assessment reason catalog key. `states`
is a nonempty unique subset of `healthy`, `warning`, `critical`. No two rules may
cover the same reason/state pair. Match against the accepted assessment's reason
key and current state. No expressions, scripts, wildcard rules or priority order.
Healthy rules are used only for an already-eligible recovery email.

`message_key` references an ordinary translatable catalog entry. `parameters`
contains exactly its named placeholders (existing maximum16). Each parameter
binding contains `source`, with optional `marks`, `precision` or `plural`.
`precision` and `plural` are mutually exclusive. Sources are closed objects:

| Source | Meaning and type |
| --- | --- |
| `{"reason_param":"path"}` | A parameter from this rule's reason. Its scalar type comes from the reason catalog entry. |
| `{"fact":"upgraded","type":"number"}` | Exactly one scalar fact in this assessment. Required type is `string`, `number` or `boolean`; missing, duplicate, table or incompatible values make Details unavailable. Text maps to string; number/percent/duration/time map to number. |
| `{"setting":"warning_percent"}` | A scalar effective setting attached to the same observation's assignment. Its type comes from the settings schema; integer maps to number. Never substitute current global defaults. |
| `{"catalog_key":"notify.marker"}` | A parameter-free catalog string, useful for emphasizing a phrase. It cannot refer recursively to other bindings. |

Resolved types must match the destination catalog parameter type, except that a
`plural` binding produces a string. No arbitrary observation JSON paths, table
selection, command output, computed formulas or implicit string-to-number casts.
Disk's existing reason parameters already identify its fullest writable filesystem.

Optional `precision` is an integer0–3 on a numeric binding. Format numbers using
the app's locale with no grouping and at most that many fraction digits; omit it
to preserve the accepted numeric value. Validate finite/safe numeric values before
formatting. Booleans use app-owned localized text.

Optional `plural` has exactly `one_key` and `other_key`. It accepts a nonnegative
safe integer source and requires each referenced catalog entry to have exactly
`{"count":"number"}` parameters. English uses `one_key` for1 and `other_key`
otherwise. This one-level expansion supports “1 upgrade” / “2 upgrades”; it is
not a general message program. Future locales need their explicit plural rules.

## Formatting and bounds

`marks` is a nonempty unique array of at most three values: `bold`, `italic`,
`underline`. It can apply to the whole rule or one substituted parameter; omitted
means plain text. Combining rule and parameter marks uses their union. The app
chooses a fixed nesting order. To emphasize literal words, bind a parameter-free
catalog phrase and mark that binding. Catalog strings remain plain text.

Split the declared message into literal text and named placeholders **before**
substituting values. A value containing braces or formatting-like text is never
parsed again. Emit at most64 nonempty text fragments and400 Unicode code points
in the final paragraph, counting text once regardless of marks. Limit a message
template to32 placeholder occurrences. Runtime invalidity or excess drops the
whole Details paragraph and retains the generic email; do not truncate a path or
sentence into misleading content. Empty output also omits Details.

Reject control characters, paragraph/line separators and bidirectional formatting
controls in this paragraph. Reject URL-like text with URI schemes or `www.` in
templates and resolved output. No link nodes/fields are supported; mail clients
may independently recognize text such as domain names. No HTML or Markdown parser,
CSS, headings, lists, images, font/size/color choices or attachment capability.

HTML escapes every literal and value and emits only app-created `strong`, `em`
and `u` elements inside the app's paragraph. The plain-text alternative concatenates
the same fragments without styling syntax. Email layout and the server link remain
app-controlled. Formatting validation does not establish that a skill is truthful.

Example descriptor for a disk warning (not a new collector API):

```json
{
  "format": 1,
  "rules": [{
    "reason": "disk_usage",
    "states": ["warning"],
    "message_key": "notify.disk.warning",
    "parameters": {
      "mount": {"source": {"reason_param": "path"}, "marks": ["bold"]},
      "used": {"source": {"reason_param": "percent"}, "precision": 1, "marks": ["bold"]},
      "threshold": {"source": {"setting": "warning_percent"}, "marks": ["bold"]}
    }
  }]
}
```

Its `messages/en.json` entry:

```json
{
  "notify.disk.warning": {
    "text": "Filesystem {mount} is {used}% full, at or above its {threshold}% warning threshold.",
    "parameters": {"mount": "string", "used": "number", "threshold": "number"}
  }
}
```

Declare a separate critical rule using the critical effective setting. Rules can
share one message key when its wording fits several states. The app renderer
does not switch on skill IDs or hardcode the four official skills.

## Evidence and messages

At a newly eligible transition, construct a bounded message snapshot from that
same projection and freeze it with the event. Keep the observation's actual
measurement time distinct from the time the alert was detected. A schedule-based
transition may occur after the last reading; never relabel it as a fresh sample.
Render declared bindings only; do not copy the entire assessment reason or facts
into the email. No skill code runs during composition or sending.

Subjects distinguish `[CRITICAL] server · Agent contact lost`, `[RESTORED] server ·
Agent contact restored`, `[WARNING/CRITICAL] server · skill` and `[RESOLVED] server ·
skill`. Do not append the product name. Contact loss indicates missing accepted
communication; it does not establish that the machine shut down. Skill recovery
describes only that skill. Unknown/stale conditions retain existing suspension.

Show explicit timezone information. The event freezes the service's validated
IANA timezone and English locale; queued retries do not change when the service
timezone changes. Contact loss uses the accepted-contact timestamp and elapsed
time at detection. Contact recovery labels that timestamp **Contact received**,
because it need not be the first heartbeat after the outage.

The four official packages declare these reasons without collection changes:

- Disk: warning/critical thresholds are inclusive. Recovery describes monitored
  writable filesystems below their warning threshold and the fullest reading.
- Packages: upgrade/new/removal/held-back counts with correct singular/plural;
  recovery says the local plan has no pending changes. Never infer installation.
- Reboot: marker present/absent. Never infer that the server actually rebooted.
- Trim: distinguish disabled/masked, failed/inactive timer, failed run and the
  existing24-hour overdue-result grace. Recovery uses the current successful,
  scheduled or awaiting-result assessment; an old success cannot confirm a new run.

## Compatibility and documentation

Expose the parsed declaration as optional `PackageMetadata.notifications`.
Validate it in the app inspector and standalone author SDK using shared fixtures.
No new fields in agent assignments, observation envelopes or assessment timelines.
Existing collectors, sandbox capabilities and core agent binary remain compatible.
Existing runtime admission permits extra JSON files and ignores this descriptor;
verify an unchanged installed agent accepts the new official packages. A newer
author SDK supplies validation; it is not a prerequisite for collecting these
packages on an already-compatible agent.

Publish the exact schema, the disk and plural examples, a non-official example,
all three style examples, bounds/fallback rules and HTML/plain-text behavior in
the public authoring documentation when implementing this contract. App inspection
rejects an invalid declaration; missing observation values only suppress Details.
Old packages without a declaration keep generic emails, including legacy skills.

## Author examples and schema

The [closed JSON schema](skill-notification-details.schema.json) specifies the
syntactic format. Admission additionally checks catalog references, source and
destination types, duplicate reason/state coverage, depth, byte limits and
prohibited paragraph text. Those cross-file checks remain authoritative.

For plural counts, define parameter-free message structure with typed bindings:

```json
{
  "source": {"fact": "upgraded", "type": "number"},
  "plural": {"one_key": "notify.upgrade.one", "other_key": "notify.upgrade.other"},
  "marks": ["bold"]
}
```

The two catalog entries have `parameters: {"count":"number"}` and text
`"{count} upgrade"` / `"{count} upgrades"`. The containing message declares this
placeholder as `string`. Counts must be nonnegative safe integers; no recursive
plural expansion or expressions.

Use `marks: ["bold"]`, `["italic"]` or `["underline"]` on a parameter or rule.
Combining them, such as `["bold","italic","underline"]`, uses fixed app nesting
`strong` → `em` → `u`. They do not alter the plain-text content. To style a phrase,
bind a parameter-free catalog entry rather than insert markup in its text.

A complete independent example is the agent repository's
[memory-pressure package](https://github.com/TinyWarden/tinywarden-agent/tree/main/skills/examples/memory-pressure).
It binds the accepted `used` scalar and effective warning/critical settings,
using all three allowed styles. Identity has no bearing on API eligibility;
official and community packages use the same renderer.

## Queue lifetime and copy-only rollout

New events use template 2. Already pending template 1 events retain their original
composer until their existing 24-hour expiry; terminal events are never resent.
Each new event freezes the bounded paragraph, sanitized names, reading/contact
instants, English locale and service timezone from its original projection.
Transient retries keep that snapshot even if names, readings or defaults change.
Claims still cancel obsolete scopes or states and suspend unknown/stale evidence.
No payload is logged or returned by notification status. Terminal transitions
clear snapshots; the existing cleanup job clears residual prose older than 90 days.
Delivery metadata and incident cursors remain.

For a template-only release, local `notifications configure --expected-database
<database> --upgrade-template` changes only the existing route's template identity
when every other setting still matches. It preserves paused state, cursors,
exposure, counters and pending IDs. A recipient or transport change is refused;
use normal configure for a deliberate settings change. Stop the notification job
before switching its fixed bundle and resume only after the route upgrade.

The guarded `skills-notification-release` local administration tool can activate
an explicitly reviewed four-package metadata-only release. It checks admitted
archive digests, unchanged executable/helper/schema/default/grant bytes and only
allows the version, notification declaration, referenced new `notify.*` catalog
entries and README to change. Reducer seeds retain their original age and sequence;
matching incident cursors retain exposure and await genuine new-version evidence.
This internal option is unavailable to uploaded packages or the public version API.
Ordinary execution changes keep the normal state/scope reset behavior.
