# Instructions for LLM assistants

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[repository guide](docs/agents/README.md) before editing. Human documentation starts
at [docs/README.md](docs/README.md).

- Inspect the owning implementation and tests before changing behavior. Preserve
  access checks, evidence freshness, replay identity and unknown/stale semantics.
- Keep skill handling generic. A compatible new skill must not need a package-name
  branch, custom renderer or compiled host-agent change.
- Use shared Playbook components for UI. Perform the complete
  [reference check](docs/contributing/playbook.md#required-ui-reference-check)
  before editing and verify the rendered result on desktop and mobile.
- Application-owned visible text belongs in English message catalogues. User data
  and protocol identifiers are not translation keys.
- Use isolated test configuration. Never run tests against the serving database or
  load serving feature flags/provider credentials into test processes.
- Update human guidance and the authoritative technical reference when behavior
  changes. Keep LLM guidance concise and link to the same facts.
- Maintain file roles and regenerate the map after staging path changes. Run
  focused checks while working and the required release gate before publication.
- Keep secrets, private working memory, local credentials and generated artifacts
  out of this repository. Preserve licenses and pinned runtime/package identities.
