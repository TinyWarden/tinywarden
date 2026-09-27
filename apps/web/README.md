# Web scaffold

Use Node 24 and npm 11. Install with `npm ci --no-audit --no-fund`.
`npm run dev` starts the informational shell on loopback. `npm run build` and
`npm start` exercise the production bundle; neither connects to a database.

Page copy, metadata and accessible labels come from `messages/en.json` through
`i18n/messages.ts`. All rendering is server-side except library boundaries that
need client behavior. No API routes, business data, auth or telemetry exist yet.

See [verification](../../docs/development/verification.md),
[UI](../../docs/ui/contract.md) and [localization](../../docs/ui/localization.md).
