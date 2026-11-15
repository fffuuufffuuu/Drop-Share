#!/usr/bin/env bash
set -euo pipefail
repo=/workspace/Drop-Share
export PATH=/workspace/.tools/node22/bin:$PATH
evidence=$(mktemp -d /workspace/work/prisma-network.XXXXXX)
commit=$(node - "$repo/server/package-lock.json" <<'JS'
const lock = require(process.argv[2]);
const version = lock.packages['node_modules/@prisma/engines-version'].version;
const match = version.match(/\.([a-f0-9]{40})$/);
if (!match) throw Error('Cannot derive locked Prisma engine commit');
console.log(match[1]);
JS
)
for artifact in schema-engine.gz libquery_engine.so.node.gz; do
  for suffix in '' .sha256; do
    name="$artifact$suffix"
    url="https://binaries.prisma.sh/all_commits/$commit/debian-openssl-3.0.x/$name"
    if ! result=$(curl --silent --show-error --location --connect-timeout 15 --max-time 60 \
      --dump-header "$evidence/$name.headers" --output "$evidence/$name.body" \
      --write-out '%{http_code} %{url_effective}' "$url"); then
      printf 'Prisma transport/proxy failure: %s\nEvidence: %s\n' "$url" "$evidence" >&2
      exit 1
    fi
    printf '%s\n' "$result"
    if [[ "$result" != '200 '* ]]; then
      cat "$evidence/$name.headers" >&2
      head -c 4096 "$evidence/$name.body" >&2
      printf '\nDownload denied; inspect response and cloud network policy. Evidence: %s\n' "$evidence" >&2
      exit 1
    fi
    rm -- "$evidence/$name.body"
  done
done
printf 'Prisma download responses recorded in %s\n' "$evidence"
