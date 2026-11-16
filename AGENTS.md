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

- The cloud development checkout is `/home/codexadmin/projects/drop`; it is separate from the production directory above.
- On the cloud host, use `export PATH=/home/codexadmin/.local/node/bin:$PATH` for the Node.js version pinned in `.node-version`.
- Keep the cloud checkout on the same reviewed commit as GitHub. Use `npm ci` with the committed lockfiles; do not copy Windows `node_modules` to Linux.
- Development databases, credentials, upload directories and listening ports must be separate from production. Never copy the production `.env` or attach production storage to development.
- Remote setup, verification and the current configuration boundary are documented in `docs/remote-development.md`.

## 多工位协作与交付规范

### 开始任务

- 开始修改前读取本文件，检查当前分支、HEAD、工作区及远端状态，明确任务基线。
- 保留已有的未提交修改，不擅自覆盖、删除、重置或混入其他任务。
- 每个任务使用独立任务分支；同一个工作目录同时只由一个 Agent 修改。
- 本地 Codex、云端 Codex 和云电脑通过 GitHub 交换源码。聊天记录和环境快照不能代替源码提交。

### 默认交付范围

- 除非用户明确要求“仅本地修改”“不要提交”或“不要推送”，代码任务默认包含修改、验证、提交及推送到 GitHub 任务分支。
- 本地 `git commit` 不代表交付完成；必须读取远端任务分支 SHA，确认与本次交付提交一致。
- 不自动合并 `main`，不自动部署生产；合并和部署须有用户明确授权。
- 用户明确给出的任务范围和限制优先，不因本规范扩大授权范围。
- 不为完成交付而强制推送、改写共享历史或绕过分支保护。

### 提交与推送

- 提交前审查差异，仅纳入本任务文件，并运行适当的检查。
- 禁止提交凭据、私钥、`.env`、数据库备份、真实用户数据和上传文件。
- 提交后推送任务分支，并通过 `git ls-remote` 等只读操作核对远端 SHA；不能仅凭本地分支名或命令已启动认定推送成功。
- 推送失败时保留工作成果，说明具体阻塞和恢复方式；不得将“仅本地提交”报告为“GitHub 已更新”。

### PR 与自动检查

- 工具及权限允许时创建或更新 PR，说明改动、验证结果及部署影响；不能创建时提供任务分支和比较链接。
- 区分“本地检查通过”和“GitHub 自动检查通过”。
- 合并、解决冲突或修改代码后，重新执行受影响的检查。
- 不声称未执行、未完成或无法读取的检查已经通过。

### 服务器开发与生产发布

- 服务器开发目录如继续使用，必须按指定已审查提交更新，不作为独立源码来源。
- 部署必须指定已推送、经过验证的提交 SHA，使用该版本对应的发布包和校验清单；不把未提交的工作区代码直接构建上线。
- 部署前验证备份，部署后验证健康、关键功能及发布文件；同时遵守本文件原有生产保护要求。
- 记录提交 SHA、发布包哈希、备份位置、验收结果和回滚方式。
- 生产紧急修改必须补回源码仓库，避免线上长期领先 GitHub。

### 任务交接与最终报告

- 交接时记录任务分支、基线 SHA、当前提交 SHA、远端是否一致、未提交修改、检查结果、剩余事项和阻塞。
- 最终报告分别说明：工作区修改、本地提交、GitHub 推送及远端核对、PR/自动检查、`main` 合并和生产部署状态；不使用含糊的“已同步”。
- 未获授权的合并或部署标注“未执行”，不作为任务失败。
- 切换设备或聊天前优先推送阶段性提交；无法推送时提供不含凭据及用户数据的恢复包和清晰的恢复说明。
