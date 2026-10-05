# Localization

English is the only enabled language. It is a catalog choice, not embedded view
copy. The web source of truth is `messages/en.json`; access it through
`i18n/messages.ts`. The agent's operator-facing CLI copy is embedded from
`internal/cli/en.json` in the separate tinywarden-agent repository. Each surface owns its catalog; do not duplicate an
English sentence in individual components.

Include all application-owned headings, buttons, placeholders, metadata, tooltips,
accessible names, validation errors, empty/loading/failure states and CLI help.
Keep stable protocol status codes independent of display labels. Render messages
as text, not HTML. User-entered content, paths and protocol identifiers are data.

Use namespaced semantic keys, not English sentences as keys. Do not concatenate
sentence fragments. Introduce an established ICU/message-format solution before
interpolated plural/gender rules or additional locales are implemented. Use Intl
for numbers/dates/units with explicit locale and timezone. Do not infer the product
user's timezone from the project's working timezone.

Adding a locale requires key coverage, missing-key behavior, locale selection and
persistence, metadata/HTML language, formatting, text expansion, accessibility and
RTL decisions. No selector or second language is included now. The static JSX
guard catches literal content/labels; reviewers must still inspect metadata,
computed strings and non-JSX surfaces.
