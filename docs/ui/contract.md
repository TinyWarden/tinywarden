# UI contract

The public entry is an honest informational surface: no fake hosts, charts, totals
or unwired operational controls. The guarded P1.C fleet reads authoritative contact
state from the application database.

Use system sans-serif typography and semantic CSS tokens in `app/globals.css`.
The current palette is neutral with restrained green emphasis. Use shared shadcn
primitives from `components/ui`, not feature-local replacements. Card and Badge
are the initial owned primitives; future controls are added when a workflow needs them.
Do not add a table engine until list behavior justifies it.

Keep one main landmark and one page heading. Include a keyboard-visible skip link,
semantic links, visible focus and named controls. Status must be readable without
color. Fit actual container width, including narrow panes; constrain overflow to
the relevant accessible region. No external fonts, analytics or tracking assets.

Use the English catalog contract for all copy. Future workflows must define loading,
empty, unavailable, permission-denied, validation, saving and conflict states.
Save establishes a baseline; cancel exits; discard restores the saved baseline.
Do not silently lose edits or let an older response replace newer input.

P1 [contact states](../architecture/agent-protocol.md#contact-state-and-operator-view)
own current/stale/unknown/revoked labels and refresh behavior. They describe contact;
health remains unknown before checks. Read failure is unavailable. Render those
distinctions through catalogs without relying on color or stale current badges.

Future overlays must escape clipping parents and preserve focus/keyboard semantics.
Use shared tooltips instead of native title attributes. Searchable vs short static
dropdown patterns are adopted only when required by actual product controls.
