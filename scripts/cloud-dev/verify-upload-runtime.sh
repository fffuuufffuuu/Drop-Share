#!/usr/bin/env bash
set -euo pipefail
repo=/workspace/Drop-Share
export PATH=/workspace/.tools/node22/bin:$PATH
export XDG_CACHE_HOME=/workspace/.cache npm_config_cache=/workspace/.npm-cache
mkdir -p /workspace/work
evidence=$(mktemp -d /workspace/work/drop-share-verification.XXXXXX)
exec > >(tee "$evidence/verification.log") 2>&1
echo "Verification evidence: $evidence"
[[ $(node --version) == "v$(cat "$repo/.node-version")" ]]
node "$repo/scripts/cloud-dev/check-env.cjs"
unshare --user --map-root-user true || { echo 'Rerun through approved exec escalation so Chromium can retain its own sandbox.'; exit 1; }
# Never attach verification to an unknown process already using the development port.
node - <<'JS'
const net = require('node:net');
const server = net.createServer();
server.on('error', () => { console.error('Port 4000 is occupied; stop only the known development backend before verification.'); process.exitCode = 1; });
server.listen(4000, () => server.close());
JS
bash "$repo/scripts/cloud-dev/check-prisma-network.sh"
bash "$repo/scripts/cloud-dev/database.sh"
cd "$repo/server"
npm run prisma:generate
npm run build
npm test -- --maxWorkers=1
cd "$repo/web"
npm run typecheck
npm run build
npm test -- --run --maxWorkers=1
bash "$repo/scripts/cloud-dev/start.sh" backend > "$evidence/backend.log" 2>&1 &
backend_pid=$!
cleanup() { kill -TERM "$backend_pid" 2>/dev/null || true; wait "$backend_pid" 2>/dev/null || true; }
trap cleanup EXIT
ready=0
for attempt in {1..40}; do
  kill -0 "$backend_pid" 2>/dev/null || { cat "$evidence/backend.log"; exit 1; }
  if curl --silent --fail --max-time 2 http://localhost:4000/api/health > /dev/null; then ready=1; break; fi
  sleep 0.25
done
[[ "$ready" == 1 ]] || { cat "$evidence/backend.log"; exit 1; }
node "$repo/scripts/cloud-dev/verify-upload.cjs"
echo 'PASS: Prisma, backend build/all tests, frontend checks/all tests, isolated database and real upload lifecycle.'
