# Visible copy and formatting

English is currently the only enabled language. Application-owned copy belongs in
[messages/en.json](../../messages/en.json), accessed through
[i18n/messages.ts](../../i18n/messages.ts). Host-agent CLI copy is owned by
`internal/cli/en.json` in the host-agent repository; author-tool copy by
`sdk/python/authoring/en.json`. Each surface owns its catalogue.

Include headings, controls, placeholders, metadata, tooltips, accessible names,
validation errors and empty/loading/failure states. Use namespaced semantic keys;
protocol identifiers, filesystem paths and user-entered data remain values rather
than translation keys. Render messages as text, never package-supplied HTML. Skill
catalogues are versioned with the package and use the
[display/notification contracts](../reference/skills/display.md).

Avoid concatenating fragments into sentences. Introduce an established ICU/message
format before adding plural/gender rules or additional locales. Use Intl and the
shared [format helpers](../../components/playbook/format.ts) for dates, numbers and
units, with explicit locale/timezone. The operator-selected display timezone is
independent of the server/project timezone. Compact table dates retain a full
accessible/title representation; a visual abbreviation must not erase the instant.

Adding a language needs complete key coverage, missing-key behavior, locale choice
and persistence, HTML/metadata language, formatting, text expansion, accessibility
and RTL decisions. A second language or selector is not implemented merely by
adding a JSON file. Run `node scripts/check-localization.mjs` and inspect computed
strings/non-JSX surfaces that a literal-copy guard cannot prove correct.
