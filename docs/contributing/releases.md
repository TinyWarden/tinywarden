# Release responsibilities

Application deployment, host-agent release and skill publication are independent
operations. A documentation or source edit alone does not publish or install any
of them. Verify the actual artifact and affected consumers before claiming support.

| Change | Owning process | Required evidence |
| --- | --- | --- |
| Web/schema/jobs | [Native application release](../operating/native-releases.md) | Exact source/tree, owned database ledger, scoped build/migration, authenticated readbacks and job identity |
| Host executable/runtime | Signed host-agent platform release | Exact committed/staged tree, binary/runtime descriptor, approved source range, pinned signing-key verification and supported-host install/update readback |
| Monitoring package | [Skill publication](../build-skills/publishing.md) | New immutable version, behavior/admission proof, canonical content/ZIP hashes, byte size and available release asset before catalogue selection |
| SDK contract/assets | Host-agent SDK plus each consuming pin | Manifest/file identity, admission/real sandbox/transport compatibility and explicit app/skills pin updates |
| Human/LLM documentation | Owning repository documentation | Current links/claims/examples, roles/maps and staged secret scan |

## Agent packaging

The host-agent `scripts/package.py --output /absolute/new-archive.tar.gz` creates
a local manual bundle with executable, runtime, configuration example, native unit
and installation/legal guidance. It is not a signed managed-update release.

`scripts/release.py` creates the managed Debian 13/amd64 release. It requires a new
absolute `--output` directory, protected matching `--signing-key`, exact
`--source-commit` and reviewed `--source-min`/`--source-max` range. Source commit
tree, staged tree and on-disk bytes must agree. It emits the archive, `release.json`,
detached signature, installer and `SHA256SUMS`; the descriptor pins binary/runtime
identities. Never place the private signing key in Git or an example command.

Managed releases preserve enrolled identity/state while replacing verified platform
assets under the update lock. Cross-repository public keys and required app
capabilities must agree. Source-version eligibility and runtime readiness are
separate from merely finding a newer tag. Refer to
[agent operations](../operating/agents.md) for administrator policy and recovery.

## Immutable content and pins

Package README/LICENSE, schemas, fixtures and descriptors participate in canonical
content identity. Never edit a published version in place. A better release README
uses a new package version; current central documentation can change independently.
Keep archive SHA-256 separate from canonical content SHA-256.

`SDK.lock.json` in official skills pins an exact SDK archive and file inventory.
The app's `runtime/skills/artifact.json` pins its accepted runtime; vendored agent
fixtures have a separate inventory. Do not update a hash only to silence a check.
Review provenance, changed contracts and consumer behavior together. Updating a
source checkout does not deploy its trusted runtime assets.

## Before publication

Run the owning [verification gate](verification.md), inspect the staged snapshot,
preserve [licenses/notices](third-party.md) and verify commands/examples against the
artifact being shipped. Confirm the exact supported/released capability matrix.
Publish assets before catalogue references; test installation and fresh readbacks
in the supported environment. Retain previous artifacts and recovery evidence.
Do not equate restarting a process with receiving a fresh collection through the
installed interpreter, or retry an uncertain release by deleting locks/state.
