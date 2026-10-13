# Public UI navigation

These are the current application routes. API endpoints are documented separately
in their owning contracts; UI route names do not change API URLs.

| Label | URL | Access |
| --- | --- | --- |
| Dashboard | `/dashboard` | Signed-in admins and users; scoped to visible servers. |
| Server details | `/fleet/{id}` | Signed-in admins and users with access to that server. |
| Skills | `/skills` | Admins. Installed skills and their settings. |
| Manage skills | `/skills/manage` | Admins. Repository catalogue, install/update reviews and ZIP upload. |
| History | `/history` | Signed-in admins and users; scoped to visible servers. |
| Settings | `/settings` | Admins. Shows the first sidebar section without redirecting. |
| Agent updates | `/settings/agent-updates` | Admins. |
| Access | `/settings/access` | Admins. |
| Skill repositories | `/settings/repositories` | Admins. |

Dashboard, Skills and History are in the main navigation. Settings is in the
account menu; its sidebar links to the three Settings sections. Read-only users
see Dashboard and History, plus server details they are allowed to view.

The Skills sidebar's **Manage skills** button opens `/skills/manage`. This page
contains the repository catalogue and **Check for updates**, **Skill repositories**
and **Upload skill** controls. Upload skill opens the existing ZIP upload and update
review modal. Installed skill settings are available on `/skills`.

`app/settings/sections.ts` defines the deliberate sidebar order and each section's
label and URL. `/settings` renders the first entry from that same list; Agent
updates is currently first. Each section also renders at its own URL. Reordering
the list changes the default automatically. Adding a section requires its own
guarded page and a landing-page renderer; the renderer map covers every section
at compile time. Section labels do not determine order.

Skill deep links use `/skills?skill={installation_id}`. The Access tab uses
`/settings/access?tab=users` or `?tab=groups`. History filters continue using
`/history` query parameters, including `host` for a server's history.

Successful sign-in opens `/dashboard`. The `/login` document is rendered on each
request and is not stored in browser or shared HTTP caches, so a deployment does
not leave a cached login document pointing at a removed route. An already-open
login tab must be refreshed to load the current client.
