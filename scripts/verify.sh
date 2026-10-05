#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:---batch}
case "$mode" in --batch|--phase-end) ;; *) printf 'Usage: %s [--batch|--phase-end]\n' "$0" >&2; exit 2;; esac
export NEXT_TELEMETRY_DISABLED=1
export PATH="$HOME/.local/bin:$PATH"
if [[ "$mode" == --phase-end ]]; then
  NODE_ENV=production npm ci --include=dev --no-audit --no-fund
fi
node scripts/check-source.mjs
node scripts/codebase-map.mjs
node scripts/check-localization.mjs
node scripts/check-agent-fixtures.mjs
node --test scripts/*.test.mjs
npm run lint
npm run typecheck
npm test
if [[ "$mode" == --phase-end ]]; then
  npm run build
  systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer
  node scripts/check-dependencies.mjs
  ./scripts/check-secrets.sh
fi
printf 'Verification passed: %s\n' "$mode"
