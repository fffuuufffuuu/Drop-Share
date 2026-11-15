#!/usr/bin/env bash
set -euo pipefail
# Only the existing isolated managed-cloud checkout; no worktree or production access.
repo=/workspace/Drop-Share
tools=/workspace/.tools/node22
dev=/workspace/.drop-share-dev
export npm_config_cache=/workspace/.npm-cache XDG_CACHE_HOME=/workspace/.cache
mkdir -p "$tools" "$dev" "$XDG_CACHE_HOME/drop-share" /workspace/work
[[ $(cat "$repo/.node-version") == 22.23.1 ]] || { echo 'Review the Node archive pin for the new .node-version.' >&2; exit 1; }
if [[ ! -x "$tools/bin/node" ]] || [[ $("$tools/bin/node" --version) != v22.23.1 ]]; then
  archive=$(mktemp -d /workspace/work/drop-node.XXXXXX)
  curl -fsS --connect-timeout 15 --max-time 120 -o "$archive/node-v22.23.1-linux-x64.tar.xz" https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-x64.tar.xz
  curl -fsS --connect-timeout 15 --max-time 30 -o "$archive/SHASUMS256.txt" https://nodejs.org/dist/v22.23.1/SHASUMS256.txt
  (cd "$archive"; awk '$2 == "node-v22.23.1-linux-x64.tar.xz"' SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$archive/node-v22.23.1-linux-x64.tar.xz" --strip-components=1 -C "$tools"
  rm -rf -- "$archive"
fi
export PATH="$tools/bin:$PATH"
bash "$repo/scripts/cloud-dev/check-prisma-network.sh"
cd "$repo/server"
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always --no-audit --no-fund
npm run prisma:generate
cd "$repo/web"
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always --no-audit --no-fund

# Same version as installed chromium-common; a renderer in a user-owned directory.
renderer_version='156.0.8078.79-1~deb13u1'
renderer_sha='3effad373d85df1bb998bb88a5768aa3b8cf715a2e0e7a4723d384240169aa80'
[[ $(dpkg-query -W -f='${Version}' chromium-common) == "$renderer_version" ]] || { echo 'Review the renderer pin together with the changed chromium-common version.' >&2; exit 1; }
renderer=/workspace/.tools/chromium-headless
package="$XDG_CACHE_HOME/drop-share/chromium-headless-shell.deb"
if [[ ! -f "$package" ]] || ! printf '%s  %s\n' "$renderer_sha" "$package" | sha256sum -c - >/dev/null; then
  curl -fsS --connect-timeout 15 --max-time 180 -o "$package.part" "https://security.debian.org/debian-security/pool/updates/main/c/chromium/chromium-headless-shell_${renderer_version}_amd64.deb"
  printf '%s  %s\n' "$renderer_sha" "$package.part" | sha256sum -c -
  mv -- "$package.part" "$package"
fi
printf '%s  %s\n' "$renderer_sha" "$package" | sha256sum -c -
mkdir -p "$renderer"
dpkg-deb -x "$package" "$renderer"
for resource in icudtl.dat locales chrome_100_percent.pak chrome_200_percent.pak resources.pak snapshot_blob.bin v8_context_snapshot.bin libEGL.so libGLESv2.so libvulkan.so.1 libvk_swiftshader.so vk_swiftshader_icd.json; do
  if [[ ! -e "$renderer/usr/lib/chromium/$resource" ]] && [[ -e "/usr/lib/chromium/$resource" ]]; then
    ln -s "/usr/lib/chromium/$resource" "$renderer/usr/lib/chromium/$resource"
  fi
done

docker pull mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902
# Preserve existing configuration and credentials; add only the missing renderer setting.
python3 - <<'PY'
from pathlib import Path
import secrets
root=Path('/workspace/.drop-share-dev')
p=root/'mysql.env'
if not p.exists():
    p.write_text('MYSQL_ROOT_PASSWORD='+secrets.token_hex(24)+'\nMYSQL_DATABASE=drop_share_dev\nMYSQL_USER=drop_dev\nMYSQL_PASSWORD='+secrets.token_hex(24)+'\n')
    p.chmod(0o600)
values=dict(line.split('=',1) for line in p.read_text().splitlines() if line and not line.startswith('#'))
assert values['MYSQL_DATABASE']=='drop_share_dev'
assert values['MYSQL_USER']=='drop_dev'
env=Path('/workspace/Drop-Share/server/.env')
if not env.exists():
    env.write_text('PORT=4000\nDATABASE_URL=mysql://drop_dev:'+values['MYSQL_PASSWORD']+'@127.0.0.1:3307/drop_share_dev\nJWT_SECRET='+secrets.token_hex(32)+'\nBASE_URL=http://localhost:4000\nDEFAULT_EXPIRES_HOURS=3\nUPLOAD_ROOT=./storage\nAUTH_PROVIDER=legacy\n')
    env.chmod(0o600)
text=env.read_text()
if not any(line.strip().removeprefix('export ').startswith('THUMBNAIL_BROWSER_PATH=') for line in text.splitlines()):
    with env.open('a') as f:
        f.write(('' if text.endswith('\n') else '\n')+'THUMBNAIL_BROWSER_PATH=/workspace/.tools/chromium-headless/usr/lib/chromium/chromium-headless-shell\n')
PY
bash "$repo/scripts/cloud-dev/verify.sh" --with-upload-check
echo 'Drop&Share isolated development environment is verified and ready.'
