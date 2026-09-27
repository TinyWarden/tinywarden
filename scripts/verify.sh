#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:---batch}
case "$mode" in --batch|--phase-end) ;; *) printf 'Usage: %s [--batch|--phase-end]\n' "$0" >&2; exit 2;; esac
export NEXT_TELEMETRY_DISABLED=1
export GOTOOLCHAIN=local
export PATH="$HOME/.local/bin:$PATH"
if [[ "$mode" == --phase-end ]]; then
  npm ci --prefix apps/web --no-audit --no-fund
fi
node scripts/check-source.mjs
node scripts/codebase-map.mjs
node scripts/check-localization.mjs
node --test scripts/verification.test.mjs
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web test
(
  cd agent
  test -z "$(gofmt -l cmd internal)"
  go vet ./...
  go test ./...
  go build -o ../bin/tinywarden-agent ./cmd/tinywarden-agent
  go mod verify
)
if [[ "$mode" == --phase-end ]]; then
  npm --prefix apps/web run build
  systemd-analyze verify infra/systemd/tinywarden.service
  npm audit --prefix apps/web --audit-level=low
  (cd agent && govulncheck ./...)
  ./scripts/check-secrets.sh
fi
printf 'Verification passed: %s\n' "$mode"
