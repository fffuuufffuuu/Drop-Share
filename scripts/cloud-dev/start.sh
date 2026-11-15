#!/usr/bin/env bash
set -euo pipefail
repo=/workspace/Drop-Share
export PATH=/workspace/.tools/node22/bin:$PATH
export XDG_CACHE_HOME=/workspace/.cache npm_config_cache=/workspace/.npm-cache
[[ $(node --version) == "v$(cat "$repo/.node-version")" ]] || { echo 'Run the cloud development installer first.' >&2; exit 1; }
node "$repo/scripts/cloud-dev/check-env.cjs"
case "${1:-backend}" in
  backend)
    # Chromium keeps its own sandbox. The command sandbox prevents nested user namespaces.
    unshare --user --map-root-user true || { echo 'Chromium needs native user namespaces. Run this command through the approved exec escalation flow; do not add --no-sandbox.' >&2; exit 1; }
    cd "$repo/server"
    exec node dist/index.js
    ;;
  web)
    cd "$repo/web"
    exec npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
    ;;
  *) echo 'Usage: start.sh [backend|web]' >&2; exit 2 ;;
esac
