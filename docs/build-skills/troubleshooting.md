# Troubleshoot skill authoring

Commands return JSON and a nonzero exit status on failure. Fix the failing layer
before retrying; raw guest tracebacks and host command stderr are not public APIs.

| Symptom or code | Meaning and next step |
| --- | --- |
| `author_id` | Use a lowercase namespaced ID; reserve `tinywarden/` for official artifacts. |
| Existing directory/output error | Init and pack do not overwrite. Choose a new destination. |
| `package_manifest`, `package_schema`, `package_display`, `package_notifications` | Check closed keys, required fields, types, finite bounds and catalogue references with static validate. |
| `package_digest` or identity conflict | Files changed or an existing ID/version has different bytes. Rebuild and use a new version. |
| `runtime:runtime_unavailable` | Prepare Python, bubblewrap, seccomp and delegated native cgroups; verify trusted runtime assets/helper. Do not run unsandboxed as a workaround. |
| `runtime:capability_denied` | Package, exact-digest approval and local ceiling must all allow the precise operation/arguments. OS permissions also apply. |
| `runtime:broker_limit` or output limit | Reduce reads/output, bound arrays and preserve explicit partial evidence. |
| `runtime:deadline_exceeded` | Fit within declared and platform limits; do not infer health from incomplete work. |
| Fixture mismatch | Compare settings, supplied clocks, reducer output and exact ordered statuses. Collection is not run by captured fixtures. |
| Resource selection rejected | Require SDK 2 or SDK 3 with resource collections, a host-scoped bounded array, empty defaults and eligible fresh inventory for new selections. |
| Unknown/stale after enabling | Check compatible host runtime, delivered assignment, successful current evidence and freshness. |
| Empty chart or dashboard value | Verify fact keys/types/encodings, descriptor compatibility and eligible accepted observations. Missing is not zero. |
| Generic notification Details | No matching rule, unavailable evidence or invalid binding uses the platform fallback. |

Use the [SDK reference](../reference/skills/sdk.md), [host access](../reference/skills/host-access.md)
and [testing guide](testing.md) to isolate the cause. For an operational host issue,
follow [operator troubleshooting](../operating/troubleshooting.md).
