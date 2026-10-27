# Documentation maintenance

The [documentation index](../README.md) is the public entry point across all three
repositories. Human guides and cross-repository technical references live here.
Executable schemas, SDK source, tests and release assets remain in their owning
repositories. A second checkout or private working memory must not be necessary
to follow public contributor instructions.

## Audience and ownership

| Location | Reader and purpose |
| --- | --- |
| `docs/get-started/` | A first successful installation and observation |
| `docs/using/` | Current page workflows, meanings and limitations |
| `docs/operating/` | Installation, configuration, upgrades, jobs and recovery |
| `docs/build-skills/` | Complete skill author journey and tested examples |
| `docs/reference/` | One owning description of each precise platform/SDK contract |
| `docs/contributing/` | Human development, verification and design guidance |
| Root `AGENTS.md`, `docs/agents/` | Public instructions and source navigation for LLM assistants |

Root READMEs stay short. CONTRIBUTING points to development and relevant checks.
LLM instructions link the same human references rather than copying their entire
specification. Use “LLM assistant” for the coding reader and “host agent” for the
installed TinyWarden process. Keep plans, tracking, private deployment details,
credentials and internal workflow out of public docs and examples.

## With a behavior change

1. Inspect the producer, consumer, tests and actual supported release. Establish
   what works now; do not turn an old proposal into a current feature claim.
2. Update the affected human task guide and owning reference. Update LLM guidance
   only when navigation, invariants or check selection changes.
3. Keep current, released and proposed behavior distinct. Compatibility claims
   name the required feature/SDK/agent version and link the source of that claim.
4. Check labels, URLs, command options, configuration and failure/recovery paths.
   Give prerequisites, expected outcomes and limits beside the relevant task.
5. Exercise changed runnable examples in an isolated scratch project. Review
   publishing, provider changes and destructive recovery commands without invoking
   them just to test prose. Prefer matching existing acceptance evidence when
   unchanged commands already have it.
6. Repair links/anchors and file roles/maps. Keep old public URLs as short pointers
   when released artifacts or supported links still reference them.

Package-local READMEs describe immutable releases. They are not the authoritative
description of the latest application workflow. Preserve their bytes; release a
new package version if changing them. Required legal/schema/runtime documents are
also not candidates for a prose-only cleanup.

When adding a skill extension surface, menu, API or SDK operation, update the human
authoring task and its exact reference in the same change. Explain the declaration,
validation/publication path, permission/readiness requirements, supported placement
and operator result. Link it from the relevant agent/skills repository entry points.
A public LLM note or endpoint inventory alone does not teach a human how to use it.

## Review paths

Review the index as a reader: first user → server → skill; operator → configuration
→ recovery; author → bootstrap → validate/test/collect/pack → publish/install;
resource author → selection/epochs → independent evidence; contributor/LLM →
owning source → affected checks. Every completed chapter must be reachable.

Links to GitHub `blob/main` files in the three project repositories should resolve
against the matching local checkout during a cross-repository edit. Check relative
links and explicit/heading anchors too. Preserve compatibility anchors embedded in
older packages. A generated file map inventories paths; it does not replace a
human guide or establish that a technical statement is correct.
