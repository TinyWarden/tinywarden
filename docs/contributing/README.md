# Contributing to the platform

Choose the repository that owns the change:

| Repository | Responsibility |
| --- | --- |
| [Application](../../README.md) | Web UI, permissions, skill admission, evaluation, history and notifications |
| [Host agent](https://github.com/TinyWarden/tinywarden-agent) | Host executable, Python SDK, isolated runtime, host observation capabilities and agent releases |
| [Official skills](https://github.com/TinyWarden/tinywarden-skills) | Monitoring packages, captured-observation tests and independent skill releases |

A skill using supported SDK operations belongs in a skill repository. New host
access or a new execution capability requires a reviewed SDK/platform contract.
Keep the extension boundary reusable for other skills.

## Development journey

1. Read the [architecture](../reference/architecture.md) and choose the owning
   source boundary. The [application file map](../agents/codebase-map.md) lists paths.
2. Follow [development setup](development.md). Keep development/test environments
   separate from a serving instance.
3. Read the affected [technical reference](../README.md#technical-reference),
   implementation and tests before changing the contract.
4. Run [affected checks](verification.md), then the applicable publication gate.
   Report missing prerequisites as missing coverage.
5. Update [human documentation and references](documentation.md), roles/maps and
   [release evidence](releases.md).

UI work follows the [shared Playbook](playbook.md). Keep
[visible copy/formatting](localization.md) in its owning catalogue, preserve
keyboard/touch use and compare actual rendered states with accepted components.
Preserve [licenses and notices](third-party.md) when copying or distributing code.

LLM assistants start with root [AGENTS.md](../../AGENTS.md) and the
[task guide](../agents/README.md); these link the same contracts used by humans.
