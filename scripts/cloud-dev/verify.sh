#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
if [[ "${1:-}" == --with-upload-check && $# == 1 ]]; then
  exec bash "$repo/scripts/cloud-dev/verify-upload-runtime.sh"
fi
[[ $# == 0 ]] || { echo 'Usage: verify.sh [--with-upload-check]' >&2; exit 2; }
node_version=$(tr -d '[:space:]' < "$repo/.node-version")
export PATH="/workspace/.tools/node${node_version%%.*}/bin:$PATH"
export XDG_CACHE_HOME=/workspace/.cache npm_config_cache=/workspace/.npm-cache
[[ $(node --version) == "v$node_version" ]] || { echo 'Run install.sh first.' >&2; exit 1; }
mkdir -p /workspace/work
evidence=$(mktemp -d /workspace/work/drop-share-unit-verification.XXXXXX)
exec > >(tee "$evidence/verification.log") 2>&1
echo "Verification evidence: $evidence"
echo "Source commit: $(git -C "$repo" rev-parse HEAD)"
cd "$repo/server"
npm run build
npm test -- --maxWorkers=1
cd "$repo/web"
npm run typecheck
npm run build
npm test -- --run --maxWorkers=1
echo 'PASS: backend build/all tests and frontend typecheck/build/all tests; no database/schema commands.'
