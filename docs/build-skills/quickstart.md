# Your first skill

Build a working memory-availability monitor, test it and produce an upload ZIP.
The SDK starter includes collection, thresholds, messages, display metadata and
notification Details. You do not need to build the Go agent or run an app locally.

## Prepare the authoring environment

Use Debian 13 amd64 and Python 3.13. Static validation and packaging use only Python's
standard library. Execution additionally requires bubblewrap, libseccomp2,
unprivileged namespaces and delegated cgroup v2 CPU/memory/PID controls. Use a
supported native systemd user session; an unavailable sandbox is a failed
prerequisite, not permission to run package code directly.

Obtain the public SDK pinned by the official skills repository:

```sh
git clone https://github.com/TinyWarden/tinywarden-skills.git
cd tinywarden-skills
tw_sdk_root=$(python3.13 -B scripts/sdk.py)
tw_skill_dir="$PWD/../acme-memory"
```

The bootstrap verifies the archive and every selected SDK file against
`SDK.lock.json`. Keep the package outside the SDK checkout. Choose a new directory
and your own lowercase namespace; `tinywarden/` is reserved.

## Create and validate

```sh
python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" init "$tw_skill_dir" \
  --id acme/memory-pressure --publisher Acme
python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" validate "$tw_skill_dir"
```

Both commands return JSON containing identity and `content_sha256`. Validation
reports `validation: "static"` and `code_executed: false`. The starter reads only
`/proc/meminfo`, calculates used memory from MemTotal and MemAvailable, and applies
warning/critical thresholds. Edit its name, description and README when adapting it.
Keep its license. See [package files](../reference/skills/package-format.md).

## Run the captured-observation tests

```sh
systemd-run --user --wait --pipe --collect \
  -p 'Delegate=cpu memory pids' -p DelegateSubgroup=supervisor \
  -p NoNewPrivileges=yes \
  /usr/bin/python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" \
  test "$tw_skill_dir"
```

The unchanged starter has five cases. Expect `passed: true` and a passing result
for each case. They execute validation, reduction and evaluation through the SDK;
they do not read this machine's memory. The [testing guide](testing.md) explains
clocks, fixtures and failure cases.

## Try real collection

Review `skill.json` capabilities before approving collection on this machine:

```sh
systemd-run --user --wait --pipe --collect \
  -p 'Delegate=cpu memory pids' -p DelegateSubgroup=supervisor \
  -p NoNewPrivileges=yes \
  /usr/bin/python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" \
  collect "$tw_skill_dir" --approve-declared-grants \
  --output "$PWD/../memory-observation.json"
```

Expect an observation with `total_bytes`, `available_bytes` and `used_percent`.
The file path must be new and outside the package. This approves all declared local
read access for this invocation; it does not enroll an agent or connect to the app.
Real values complement deterministic fixtures rather than replacing them.

## Package and install

```sh
python3.13 -I -S -B "$tw_sdk_root/sdk/python/skill_tool.py" pack "$tw_skill_dir" \
  --output "$PWD/../acme-memory.zip"
```

Expect `content_sha256`, `archive_sha256` and `archive_bytes`. Pack never overwrites
an existing output. A repeated build of unchanged input produces identical ZIP
bytes. Changing README, tests or descriptors changes content identity too.

As an administrator, open **Skills → Manage skills → Upload skill** and upload the
ZIP. A new installation starts disabled. Review that version's declared access,
approve it and enable the skill. Compatible agents receive the assignment on their
next connection; no binary rebuild is required. Configure defaults in Skills and
individual overrides on a server. Read [publishing and updates](publishing.md)
before distributing another version.
