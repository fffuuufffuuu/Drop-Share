#!/usr/bin/env bash
set -euo pipefail
export PATH=/workspace/.tools/node22/bin:$PATH
export XDG_CACHE_HOME=/workspace/.cache
export npm_config_cache=/workspace/.npm-cache
node /workspace/Drop-Share/scripts/cloud-dev/check-env.cjs
if docker container inspect drop-share-dev-mysql >/dev/null 2>&1; then
  docker inspect drop-share-dev-mysql | node -e '
    const fs=require("node:fs"); const c=JSON.parse(fs.readFileSync(0,"utf8"))[0];
    const bindings=c.HostConfig.PortBindings["3306/tcp"];
    if(c.Config.Image!=="mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902" || bindings?.length!==1 || bindings[0].HostIp!=="127.0.0.1" || bindings[0].HostPort!=="3307" || !c.Mounts.some(m=>m.Source==="/workspace/.drop-share-dev/mysql" && m.Destination==="/var/lib/mysql")) throw Error("Unexpected development database container configuration");
  '
  docker start drop-share-dev-mysql >/dev/null
else
  mkdir -p /workspace/.drop-share-dev/mysql
  docker run -d --name drop-share-dev-mysql --env-file /workspace/.drop-share-dev/mysql.env -p 127.0.0.1:3307:3306 --mount type=bind,src=/workspace/.drop-share-dev/mysql,dst=/var/lib/mysql mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902
fi
ready=0
for attempt in {1..30}; do
  if docker exec drop-share-dev-mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" -D "$MYSQL_DATABASE" -e "SELECT 1"' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { docker logs --tail 20 drop-share-dev-mysql; exit 1; }
cd /workspace/Drop-Share/server
# Guard against applying a schema to any database except this isolated local dev DB.
node /workspace/Drop-Share/scripts/cloud-dev/check-env.cjs
# Populate the dev database directly from schema; historical migrations omit a baseline.
npx --no-install prisma db push --skip-generate
