# Drop project working rules

- Treat `/www/wwwroot/drop.yaoguosir.com` as production. Do not edit it directly.
- Work only in `/home/codexadmin/projects/drop` unless the user explicitly requests deployment.
- Never commit `.env`, database dumps, uploaded files, credentials, or production backups.
- Use Node.js from `/home/codexadmin/.local/node/bin`.
- Verify backend changes with `cd server && npm run build`.
- Verify frontend changes with `cd web && npm run typecheck && npm run build`.
- Before any production deployment, back up the database, uploaded files, and current release.
- Production deployment must preserve `/www/wwwroot/drop.yaoguosir.com/server/.env` and `server/storage`.
- Do not run automatic dependency upgrades or database migrations against production without explicit approval.
