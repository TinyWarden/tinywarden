# Skill repositories and marketplace

Skills (`/skills`) contains installed skills and their settings. Its sidebar's
**Manage skills** button opens `/skills/manage`, which lists packages advertised
by enabled repositories, alphabetically. **Upload skill** beside Check for updates
and Skill repositories opens the ZIP upload/update modal. Settings → Skill
repositories (`/settings/repositories`) lets administrators add a public GitHub URL, refresh its catalogue,
enable/disable it, or remove a community source. TinyWarden's official repository
is present and enabled by default. Enabling a repository only enables browsing.

## Installation and updates

Select Install, review the actual package and its server access, then confirm.
New skills are installed disabled; enable them on Skills after approving
their declared access. Update available appears for a newer version from the
installation's chosen repository. Updating is manual and reviews the exact package
and grants. The existing On/Off choice, compatible defaults/overrides and retained
history are preserved. Reducer state follows the existing package-version rules.

ZIP upload remains available for community packages. Updating a repository-tracked
community skill with a ZIP requires confirmation that repository update tracking
will stop. Official reserved-namespace packages are acquired through their official
repository. A local/upload package can connect to a repository only when the current
ID, version and content are identical. Different repositories cannot replace each
other's installed skill IDs; forks should use their own namespace.

Removing or disabling a repository preserves its installed packages and history.
Removal keeps a source identity record so the same repository can be added again.
No automatic skill installation or version update occurs during catalogue refresh.
The UI may refresh an absent/old selected catalogue on Manage skills; Check for updates
refreshes enabled sources. Local reads never perform external requests. Failures
show cached catalogue information and a clear availability message.

## Repository convention v1

Public GitHub repositories publish a regular root `SKILLS.json` on their default
branch. `SKILLS.md` can explain the repository to humans. The app pins a commit
and reads the exact regular Git blob; source code is never built in the app.

```json
{
  "format": 1,
  "skills": [{
    "id": "acme/memory-pressure",
    "version": "1.0.0",
    "name": "Memory pressure",
    "description": "Checks the server's available memory.",
    "content_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "archive": {
      "tag": "memory-pressure-v1.0.0",
      "asset": "memory-pressure-1.0.0.zip",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "size": 12345
    }
  }]
}
```

The hashes/size above are examples: use the real content/ZIP identity returned by
the [SDK packaging tools](https://github.com/TinyWarden/tinywarden-agent/blob/main/docs/skills/authoring.md).
The [JSON schema](skill-repository.schema.json) describes the closed catalogue.
Publish ready ZIPs as stable, published GitHub Release assets in the SAME repository,
then commit the catalogue. Absolute external download URLs are not accepted.

Advertise one current stable version per skill ID. Versions are numeric
major.minor.patch; each component has at most nine digits, no leading zeros.
Keep released bytes immutable; changing package contents requires a new version.
Past releases and installed observations remain independent of catalogue membership.
No supported downgrade is initiated by a lower advertised version.

Limits: 20 configured repositories, 200 entries/512 KiB per catalogue, 100 installed
skills, and 50 catalogue items per page. Names/descriptions are plain text bounded to
120/500 characters. IDs use the SDK namespace/slug grammar. Tags and ZIP names use
letters/digits/dot/underscore/hyphen, start with a letter/digit and are at most128
characters. ZIP admission retains its compressed/unpacked/file/path limits.

## Origin and access

Official means acquired through GitHub repository ID1415093600 while owned by
TinyWarden organization ID334682923. Names and publisher claims cannot grant the
badge. Each community source also pins its repository and owner identity. A
transfer/replacement prevents new acquisitions until separately resolved; historic
package origin remains recorded. Local CLI import trust does not fabricate remote
origin. Package signatures are not required by this first repository format.

The app verifies repository identity before/after acquisition, release/asset
membership, streamed ZIP size/hash, manifest ID/version and canonical content hash.
HTTPS and constrained GitHub/CDN redirects protect the fetch boundary. No operator
cookies, enrollment credentials or ambient GitHub tokens are forwarded. Origin
identifies publishing provenance; sandbox restrictions and explicit host-access
approval remain applicable to every package.

All management/installation APIs require Admin, same-origin mutation protection
and the current session/ACL revision. User accounts cannot manage catalogues.
Preparation caches immutable bytes for30minutes without creating/selecting an
installation. Confirmation rechecks the actor, source/config/catalogue/installation
heads and approved exact grants in one short transaction. Cancelled/expired/conflicting
reviews cannot commit. Ambiguous requests retry their original request UUID/result.
Network, archive admission and sandbox validation never hold database/host locks.

Preparations are bounded to2 per actor/20 live instance-wide. Cancelled previews and
expired private caches are cleaned without touching installed packages/evidence.
GitHub outages/rate limits retain cached browsing; fresh installation still requires
a successful verified preparation. Refresh has a60second cooldown and rate-limit
backoff. Public repository access requires no GitHub credentials.

## API routes

All mutation bodies have `schema_version:1` and a UUID `request_id`. Responses carry
the existing account/access revision stamp. Fields and action types are closed.

| Route | Method | Additional fields |
| --- | --- | --- |
| `/api/v2/operator/skill-repositories` | GET | None |
| `/api/v2/operator/skill-repositories` | POST | `url` |
| `/api/v2/operator/skill-repositories/{id}` | POST | `expected_revision`, `action` (enable/disable/remove) |
| `/api/v2/operator/skill-repositories/{id}/refresh` | POST | `expected_revision` |
| `/api/v2/operator/skill-marketplace` | GET | Query `q`, optional `repository`, `page` |
| `/api/v2/operator/skill-marketplace/prepare` | POST | `repository_id`, `skill_id`, `content_sha256`, `catalogue_revision` |
| `/api/v2/operator/skill-marketplace/preparations/{id}` | GET | None |
| `/api/v2/operator/skill-marketplace/commit` | POST | `preparation_id`, `content_sha256`, `grants` |
| `/api/v2/operator/skill-marketplace/cancel` | POST | `preparation_id` |

Catalogue names/descriptions are browsing hints. The review shows metadata and
capabilities from the actually admitted package. Raw package HTML, CSS, JavaScript,
installation hooks or source-provided navigation are never rendered/executed.
