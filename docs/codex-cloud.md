# Codex Cloud 可复用开发环境

建议环境名称：`Drop&Share · Codex Cloud`。这是建议值，实际名称和发布状态以 Codex 界面为准。

代码来源为 GitHub `fffuuufffuuu/Drop-Share` 的 `main`。2026-11-15 实时核实的 main 为 `bc3d2c5759ca68bc2645d6c1d09a6d6df5296602`；以后启动新任务应重新核实远端 main，不能永远固定在这个历史提交。安装脚本不会自行 pull 或覆盖未提交修改，由环境的仓库配置负责检出。

## 配置与安装

在 Codex 云环境管理界面选择 OpenAI 托管环境，连接上述 GitHub 仓库并选择 main。若授权选择器中没有仓库，再在 GitHub 连接设置中为该仓库授权。此环境不需要腾讯云 SSH、原电脑文件、生产数据库、生产密钥或生产上传文件。

配置脚本提交所在分支的 PR 合并到 main 后，在环境的安装步骤填写（工作目录为仓库根目录）：

```bash
bash scripts/cloud-dev/install.sh
```

脚本从 `.node-version` 获取精确 Node 版本，安装到 `/workspace/.tools/node22`，校验 Node 官方下载文件，随后依次执行：

```bash
cd server
npm ci --no-audit --no-fund
npm run prisma:generate
cd ../web
npm ci --no-audit --no-fund
```

脚本将 npm 下载域名固定为官方 registry，保留锁文件版本与完整性校验。默认流程不执行数据库迁移、db push 或 reset，也不生成 `.env`、启动数据库、复制上传文件或配置 CloudBase。既有独立开发数据库和目录保留；真实上传运行环境是先前验证过的独立可选流程，通过 `--with-upload-check` 明确启用，不能用于本次默认设置。

后续命令需要在使用 Node 前设置：

```bash
export PATH=/workspace/.tools/node22/bin:$PATH
```

验证脚本自己设置该路径，直接执行即可：

```bash
bash scripts/cloud-dev/verify.sh
```

它依次运行 `server` 的 `npm run build`、`npm test -- --maxWorkers=1`，以及 `web` 的 `npm run typecheck`、`npm run build`、`npm test -- --run --maxWorkers=1`。测试使用 mock 和临时数据。所有步骤必须实际通过；不可将上次结果当成本次结果。

2026-11-15 本轮已实际执行默认安装和验证脚本，均以 0 退出。Node 22.23.1、Prisma Client 6.19.2；后端构建和 33 个文件中的全部 263 项测试通过，前端类型检查、构建和 28 个文件中的全部 168 项测试通过。未改动业务源码、package.json 或锁文件；本轮未执行数据库 schema 命令。复验记录：`/workspace/work/drop-share-unit-verification.PLT4Gz/verification.log`。

## 网络

使用受限网络和包管理器预设，并增加 `binaries.prisma.sh`。默认安装实际使用：

| 域名 | 用途 |
| --- | --- |
| `github.com` | 仓库检出和同步 |
| `nodejs.org` | 精确 Node 版本及官方 SHA-256 清单 |
| `registry.npmjs.org` | server/web 锁定依赖，包括 esbuild、sharp 的平台包 |
| `binaries.prisma.sh` | Prisma 引擎及 checksum |

GitHub 连接器访问权限和环境 Git 命令的网络/认证是两条路径，应分别验证。首次 Git 请求若出现 503，应保存错误并重试；本轮使用 HTTP/1.1 的新连接成功读取 main。不要关闭 TLS、删除代理配置或绕过网络策略。

若安装下载失败，根据实际 URL 和重定向决定是否需要额外域名，不预先开放所有网络。诊断 Prisma 时使用 `DEBUG='prisma:fetch-engine*' npm run prisma:generate`，检查实际响应头、正文和代理错误。`scripts/cloud-dev/check-prisma-network.sh` 可对当前 x64/OpenSSL 3 环境的锁定引擎 URL 和校验文件做 GET 检查。当前策略需同时满足 `observations_current=true`、`network_policy.state=enforced`，并通过实际请求验证。

## 保存和发布

安装完成、规定检查全部通过、配置变更已提交到 GitHub 后，才完成界面的保存和发布：

1. 在当前聊天的环境设置中核对仓库、分支、名称、安装步骤和网络规则。若有 **Promote**，将当前配置提升为可复用配置；没有该入口时，从环境管理中新建或编辑可复用配置。
2. 若处于设置草稿，选择 **Save draft**，核对设置生效后选择 **Publish**。名称与按钮以实际界面为准；保存运行中实例的规则不等同于发布新配置。
3. 从发布后的版本新开一个云端任务，再运行安装/验证命令，确认全新任务可以复现。已有运行任务可能仍使用旧版本。

当前聊天的工具仅提供环境状态与诊断，没有创建、命名、保存草稿或发布配置的接口，因此不能自动完成以上界面操作，也不能凭环境 version ID 声称已经发布。

## 换电脑继续

使用同一个 OpenAI 账号和工作区登录 Codex，在历史任务/聊天中打开原来的云端聊天，可以继续已有上下文；不要新建聊天后假定旧聊天的未提交文件自动出现。若原任务已结束或环境被回收，从已发布的环境启动新任务，并从 GitHub main 恢复代码。

云端工作区和环境快照不能代替 Git：在用户授权下将成果提交并推送到 GitHub 分支，通过 PR 审阅后合并到 main。未合并的配置分支仍可从另一台电脑取回，但 main 不会自动包含其脚本。不要把 `.env`、缓存、依赖、构建产物、数据库或上传文件提交到 GitHub。
