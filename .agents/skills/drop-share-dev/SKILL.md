---
name: drop-share-dev
description: 在受管云环境安装、启动和复验 Drop&Share 的独立开发环境；诊断 Prisma 下载及真实上传流程。
---

# Drop&Share 云端开发启动

适用于 OpenAI 托管 Codex Cloud 的 Drop&Share 检出目录。先读仓库 `AGENTS.md` 和 `docs/codex-cloud.md`，保留现有修改。腾讯云路径只适用于腾讯云，不作为这里的前置条件。不升级锁定依赖或部署；只有用户授权时才提交和推送。环境可用与配置已发布是不同状态，不能混报。

## 默认安装与 mock 测试

```bash
bash scripts/cloud-dev/install.sh
```

在仓库根目录执行。安装脚本按 `.node-version` 配置 `/workspace/.tools/node22`，依次执行 server/web 的 `npm ci` 和 `npm run prisma:generate`。默认不创建或连接数据库，不执行 migrate、db push、reset，不创建凭据、存储或服务。允许读取已有的独立开发配置，但不得复制生产配置。

```bash
bash scripts/cloud-dev/verify.sh
```

依次运行后端 build/全部测试和前端 typecheck/build/全部测试，单 worker，使用 mock 与临时文件。任一步失败均非零退出，不跳过 Prisma 或失败测试。当前基线为后端 263 项、前端 168 项；以实际结果为准，不能硬编码测试数量决定成功。

## 可选真实上传环境

只有用户另外明确要求真实上传、独立开发数据库时，才运行：

```bash
bash scripts/cloud-dev/install.sh --with-upload-check
# 已安装运行环境时完整复验
bash scripts/cloud-dev/verify.sh --with-upload-check
```

这条可选路径会配置受严格校验的 `127.0.0.1:3307/drop_share_dev`，执行 schema 同步及 12 项真实上传验收，因此不适用于“只生成客户端，不迁移数据库”的环境设置任务。保留已有 `.env`、密码、数据与上传目录，不连接生产数据库，不加 `--accept-data-loss` 或 reset。

## 启动

```bash
bash /workspace/.drop-share-dev/database.sh
bash /workspace/Drop-Share/scripts/cloud-dev/start.sh backend
# 在另一个终端执行
bash /workspace/Drop-Share/scripts/cloud-dev/start.sh web
```

后端 `http://localhost:4000`，前端 `http://localhost:5173`。浏览器远程预览需要同时转发 API 4000 端口；远程前端当前不自动支持任意预览域名，请勿把开发页面连接到生产 API。

缩略图使用 `THUMBNAIL_BROWSER_PATH=/workspace/.tools/chromium-headless/usr/lib/chromium/chromium-headless-shell`。可选运行环境安装脚本校验同版本 Debian 包的固定 SHA-256，复用已装的 chromium-common 资源；保留 Chromium 自身沙箱及应用的临时网络代理。

命令工具沙箱会映射 helper 属主并限制嵌套用户命名空间。若 `unshare --user --map-root-user true` 失败，或出现 helper 属主错误，对 `verify.sh --with-upload-check` / `start.sh backend` 使用命令工具的 `sandbox_permissions="require_escalated"` 审批流程。不要添加 `--no-sandbox`、修改系统沙箱或浏览器策略。仅可选真实上传流程需要该运行方式；默认安装和 mock 测试不依赖 Chromium 或嵌套命名空间。

## Prisma 下载诊断

先读取当前云环境状态：`observations_current: true` 且 `network_policy.state: enforced`，确认允许 `binaries.prisma.sh`，然后建立新连接。不能仅凭“规则已保存”声称生效。

运行 `scripts/cloud-dev/check-prisma-network.sh`。它从 lockfile 取真实引擎 commit，GET 两个 `.gz` 和对应 checksum URL，保存响应头；失败时保留响应体并返回非零。Prisma 本身仍负责下载与完整性校验。

若生成失败，用 `DEBUG='prisma:fetch-engine*' npm run prisma:generate` 获取实际 URL，再检查跳转、状态、响应头、响应体和代理错误。代理策略拒绝属于云环境网络限制；上游 403 需要依据服务响应判断，不能仅凭状态码归因。保留继承的代理、NO_PROXY 和 CA 设置，隐藏凭据；不关闭 TLS 校验、不换镜像绕过限制、不静默跳过失败项。

只有所请求的验收命令成功退出后，才能报告当前云端工作区验证通过。还需通过界面的 Promote/Save draft/Publish 保存并发布配置，才能报告可复用环境已发布；当前工具不提供发布能力时，给出用户操作步骤，不虚构名称或发布状态。新任务必须再次验证已发布版本。CloudBase 真实短信/邮箱服务和生产环境不属于默认验收范围。
