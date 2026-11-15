#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
if [[ "${1:-}" == --with-upload-check && $# == 1 ]]; then
  exec bash "$repo/scripts/cloud-dev/install-upload-runtime.sh"
fi
[[ $# == 0 ]] || { echo 'Usage: install.sh [--with-upload-check]' >&2; exit 2; }
node_version=$(tr -d '[:space:]' < "$repo/.node-version")
[[ "$node_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid .node-version' >&2; exit 1; }
[[ $(uname -s) == Linux ]] || { echo 'This setup is for the managed Linux cloud environment.' >&2; exit 1; }
case $(uname -m) in x86_64) arch=x64 ;; aarch64) arch=arm64 ;; *) echo 'Unsupported architecture' >&2; exit 1 ;; esac
node_tools="/workspace/.tools/node${node_version%%.*}"
export XDG_CACHE_HOME=/workspace/.cache npm_config_cache=/workspace/.npm-cache
mkdir -p "$node_tools" "$XDG_CACHE_HOME" /workspace/work
if [[ ! -x "$node_tools/bin/node" ]] || [[ $("$node_tools/bin/node" --version) != "v$node_version" ]]; then
  download=$(mktemp -d /workspace/work/drop-node.XXXXXX)
  trap 'rm -rf -- "$download"' EXIT
  archive="node-v$node_version-linux-$arch.tar.xz"
  curl -fsS --connect-timeout 15 --max-time 180 -o "$download/$archive" "https://nodejs.org/dist/v$node_version/$archive"
  curl -fsS --connect-timeout 15 --max-time 30 -o "$download/SHASUMS256.txt" "https://nodejs.org/dist/v$node_version/SHASUMS256.txt"
  (cd "$download"; awk -v name="$archive" '$2 == name' SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$download/$archive" --strip-components=1 -C "$node_tools"
fi
export PATH="$node_tools/bin:$PATH"
[[ $(node --version) == "v$node_version" ]]
echo "Node $(node --version); checkout $(git -C "$repo" rev-parse HEAD)"
cd "$repo/server"
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always --no-audit --no-fund
npm run prisma:generate
cd "$repo/web"
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always --no-audit --no-fund
echo 'Setup complete. No database/schema commands, credentials, storage or services were configured.'
