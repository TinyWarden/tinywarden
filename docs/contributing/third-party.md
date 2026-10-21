# Licenses and third-party material

Original project source is Apache-2.0. Preserve [LICENSE](../../LICENSE) and
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). Copied shadcn component
source retains its MIT attribution. Local unmodified Bricolage Grotesque and IBM
Plex Sans/Mono WOFF2 fonts retain their full SIL OFL notices in
[public/fonts](../../public/fonts). Original SVG paths do not import a design-export
runtime.

Installed npm packages retain their own licenses. Do not describe the entire
dependency graph as Apache-2.0 or MIT. In particular, native Sharp/libvips
distributions can include LGPL libraries, Lightning CSS is MPL-2.0 and caniuse-lite
data is CC-BY-4.0. Read actual locked package LICENSE/NOTICE files when preparing
an artifact. Current dependencies and integrity hashes are in
[package.json](../../package.json) and [package-lock.json](../../package-lock.json).

Before copying/adapting source, retain the required upstream notices and review
its terms. Before distributing a bundle/native archive, inventory actual included
files, preserve attributions and satisfy applicable source/library replacement
requirements. Installing dependencies or checking the scaffold license alone does
not establish redistribution completeness.

The Go host-agent module currently has only standard-library dependencies; build
and scanning tools are separate. Monitoring packages include their own required
LICENSE/README, whose bytes are part of package identity. A new release must retain
the notices applicable to what it actually ships. See [releases](releases.md).
