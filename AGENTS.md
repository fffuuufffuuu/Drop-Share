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
