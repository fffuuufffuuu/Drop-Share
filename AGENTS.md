# Drop&Share project working rules

- This repository is the development source for the live site at `drop.yaoguosir.com`.
- Never edit `/www/wwwroot/drop.yaoguosir.com` directly during development.
- Never commit `.env`, database dumps, uploaded files, credentials, or production backups.
- Verify backend changes with `cd server && npm run build`.
- Verify frontend changes with `cd web && npm run typecheck && npm run build`.
- Production deployments use the `codexadmin@110.42.231.29` SSH connection.
- Before any production deployment, back up the database, uploaded files, and current release.
- A deployment must preserve the production `server/.env` and `server/storage`.
- Do not upgrade dependencies or run production database migrations without explicit approval.

## Remote development

This section describes the Tencent Cloud SSH host. For OpenAI-hosted Codex Cloud, use the separate section below.

- The cloud development checkout is `/home/codexadmin/projects/drop`; it is separate from the production directory above.
- On the cloud host, use `export PATH=/home/codexadmin/.local/node/bin:$PATH` for the Node.js version pinned in `.node-version`.
- Keep the cloud checkout on the same reviewed commit as GitHub. Use `npm ci` with the committed lockfiles; do not copy Windows `node_modules` to Linux.
- Development databases, credentials, upload directories and listening ports must be separate from production. Never copy the production `.env` or attach production storage to development.
- Remote setup, verification and the current configuration boundary are documented in `docs/remote-development.md`.

## Codex Cloud

- Read `docs/codex-cloud.md`; do not reuse Tencent Cloud paths or its Node installation.
- Default setup: `bash scripts/cloud-dev/install.sh`. Default checks: `bash scripts/cloud-dev/verify.sh`.
- Default setup only installs the locked dependencies and generates Prisma Client. Do not run database migrations, schema push, real upload setup or copy production data unless the user separately requests that work.
- The `--with-upload-check` option is only for an explicitly requested isolated database/upload verification.
- Verify the latest requested GitHub ref and preserve existing edits. Save authorized changes back to GitHub; workspace persistence alone is insufficient.
- A running workspace is not proof that a reusable environment is published. Confirm publication in the environment UI and verify a new task from that published version.
