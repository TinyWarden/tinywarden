# Pages and access

| Page | URL | Access |
| --- | --- | --- |
| Entry | `/` | Redirects to sign in |
| Dashboard | `/dashboard` | Signed-in accounts, scoped to visible servers |
| Fleet | `/fleet` | Scoped read; Admin management |
| Server | `/fleet/{id}` | Signed-in accounts with server access |
| History | `/history` | Signed-in accounts, scoped to visible servers |
| Skills | `/skills` | Admin |
| Manage skills | `/skills/manage` | Admin |
| Settings landing | `/settings` | Admin; first section, Skill repositories |
| Skill repositories | `/settings/repositories` | Admin |
| Agents | `/settings/agents` | Admin |
| Users & groups | `/settings/users` | Admin |
| Sign-in settings | `/settings/sign-in` | Admin |
| Data | `/settings/data` | Admin |
| My account | `/account` | Signed-in accounts |
| Change password | `/account/password` | Eligible local-password accounts/initial password change |
| Sign in | `/login` | Public |
| Sign-in completion | `/login/complete` | Public same-origin OIDC completion |
| Forgot password | `/forgot-password` | Public |
| Reset password | `/reset-password` | Public; explicit token confirmation |
| Verify email | `/verify-email` | Public; explicit token confirmation |
| Playbook | `/playbook` | Public static component examples |

Main navigation contains Dashboard, Fleet, Skills and History as permitted by role.
Settings and My account are in the account menu. Read-only users have Dashboard, Fleet,
History and their permitted server pages. Successful sign-in opens Dashboard.

Skill deep links use `/skills?skill={installation_id}`. Users & groups supports
`?tab=users` and `?tab=groups`; History supports a server `host` filter. UI labels
and routes do not rename API endpoints. [Settings section source](../../app/settings/sections.ts)
owns the sidebar order and landing selection.

Fleet navigation sits between Dashboard and Skills; `/fleet/{id}` remains the
server details route. Settings Data follows Sign-in. Fleet groups do not replace
Users & groups permission groups. See [Fleet](../using/fleet.md).
