# Publish and update a skill

A skill version is immutable. Finish source, tests, messages, README, license and
optional descriptors before packaging. Changing any included file changes content
identity. Use a new semantic version for changed content, even for documentation.

## Prepare a release

1. Validate the directory with the pinned supported SDK.
2. Run captured-observation tests and any necessary real sandbox/collection checks.
3. Build a new ZIP with `skill_tool.py pack --output /new/absolute/path.zip`.
4. Retain the returned content SHA-256, ZIP SHA-256 and ZIP byte size.
5. Install/review in a suitable test installation before distributing it.

ZIP hash identifies transport bytes. Content hash identifies canonical package
files. Neither proves authorship or safety. Preserve the package license when
adapting another author’s code and use your own namespace.

## Publish through a repository

Expose a format-1 `SKILLS.json` on a public GitHub repository's default branch. Each
entry has identity, version, name/description, content hash and an archive containing
`tag`, `asset`, ZIP hash and size. The release must be stable, published, and belong
to that same repository. Publish the ZIP asset before the catalogue entry.

Use the [repository convention](https://github.com/TinyWarden/tinywarden-skills/blob/main/SKILLS.md)
and [catalogue schema](../architecture/skill-repository.schema.json). Limits include
200 entries, 512 KiB catalogue bytes and 10 MiB per ZIP. Safe release/asset names
and stable semantic versions are enforced by the app.

The Official badge is based on verified repository ownership/origin. A publisher
string or a copied namespace does not grant it. Administrators still review exact
package access. The app never builds repository source to discover skills.

## Install and update

Administrators add the repository in **Settings → Skill repositories**, then use
**Skills → Manage skills** to browse/install/update. ZIP upload is also available.
A new skill starts disabled. Every newly selected digest needs access review;
uploading another version alone does not change the active version.

Updates preserve compatible global defaults, per-field server overrides and retained
history. Selecting a version currently requires the same settings schema; arbitrary
settings/state migrations are unsupported. A version selection resets remembered
state and assignment authority. Preserve stable metric/dashboard IDs when their
meaning is unchanged; use new IDs when semantics change.

For a package with actions, publish through a repository with verified origin;
an uploaded ZIP alone cannot establish publisher authority for execution. Each
selected package version needs a separate review and grant for each action.
Monitoring access approval does not renew action permission. The host also needs
compatible runtime support, local publisher/class policy and the declared
prerequisites. Pending work retains its original package for settlement; updating
the package does not authorize an older queued job to start. See
[action authoring](actions.md#input-labels-and-permission-review).

Do not overwrite a published ZIP/tag to change behavior. Keep old referenced content
and understand [compatibility](../reference/skills/compatibility.md) before updating
SDK pins or requiring newer host operations. Publishing a package does not authorize
restarting hosts or changing services.
