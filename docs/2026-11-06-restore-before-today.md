# 恢复到 2026-11-06 当天改动前的线上版本

用户明确要求恢复今天改动前的完整运行状态。此次仅恢复生产构建与运行配置，没有重置本地工作区或 Git 分支。

- 前端基准：`/www/backup/drop-deploy/20261106-ux-1-3-4-cd1259c/previous-web-dist.tar.gz`，即今天首次发布前的线上前端，包含昨晚已上线的主题、消息和缩略图。入口资源为 `index-C9e38pIE.js`、`index-CbyogIFS.css`。
- 后端基准：`/www/backup/drop-deploy/20261106-d1-d3-bug2-5-4952a89/previous-server-dist.tar.gz`。此前只有前端发布；与昨晚最后的 contact-rebind-r2 发布比对一致，已删除的旧管理模块除外。
- 两个恢复归档先与各自备份 SHA256SUMS 核对，再暂存解包。恢复后 33 个前端文件、37 个后端文件逐项哈希匹配；公网实际 JS/CSS 也与恢复文件一致。
- 登录阻断点：运行中的 Prisma 无法自动定位引擎，要求缺失的 `debian-openssl-1.0.x`。指定服务器已有 `libquery_engine-debian-openssl-3.0.x.so.node` 后，独立只读查询成功。通过 PM2 的 `PRISMA_QUERY_ENGINE_LIBRARY` 指定该现有引擎，并保存进程配置；已核验正在运行的进程和保存的 PM2 配置均包含该值。未升级任何依赖或运行数据库迁移。

恢复前短暂停止应用写入，备份数据库、全部 storage 文件（含缓存，以硬链接保存并逐文件哈希）、当前应用、Prisma Client 和 PM2 配置。备份目录：`/www/backup/drop-deploy/20261106-restore-before-today`，权限限制为服务器 root。恢复前被替换的 dist 目录亦保留在其中。

恢复后数据库导出与恢复前快照去除导出时间注释后完全一致。1184 个 storage 文件，共 1507225610 字节，逐项哈希不变；生产 `.env` 内容不变。数据库计数：User 8、Space 10、Deployment 150、SpaceTag 6、DeploymentTag 10、SpaceAdministrator 1、DeploymentComment 1、Notification 0。今天新增的业务数据全部保留。

HTTPS 首页、健康接口和认证配置均正常。现有已绑定账号的只读身份解析成功，返回同一用户；未发送测试验证码或修改真实账号，尚未由用户完成一次真实短信登录验证。

验收证据保存在备份目录中的 `database-verification.json`、`verification.json`、`health.json` 和 `SHA256SUMS`。历史备份未删除。

## GitHub 源码同步

用户随后要求 GitHub 同步到当前恢复版本。以 GitHub `main` 的 `4952a89` 为父提交，在新提交中恢复昨晚最终发布包的源码，保留历史，不强推。归档按源码白名单提取，不包含环境配置、数据库、上传文件、安装依赖或构建产物。

102 个非测试源码/配置文件与昨晚最终发布包逐项一致（文本换行统一为 LF 后核对）；完整清单见 `2026-11-06-restored-source-manifest.json`。本地重新构建出的 `index-C9e38pIE.js`、`index-CbyogIFS.css` 与公网文件逐字节一致。测试使用本地保留的回归用例，并将旧导航、默认 iframe 等过时断言适配恢复版本；今天已撤销功能的专属用例不再保留。

原工作区所有未提交工作保存在标注 `preserve local work before syncing restored production 2026-11-06` 的 Git stash 中。该备份包含本地尚未提交的工作，不因本次同步删除。

重新部署此版本时仍须先备份、保留生产 `.env` 和 `storage`；不得重放已应用迁移。运行时要沿用已验证的 PM2 引擎配置：`PRISMA_QUERY_ENGINE_LIBRARY` 指向服务器 `node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node`，启动后执行数据库只读检查，不能仅依赖 `/api/health`。

同步验收：后端构建与 257 项测试通过；前端类型检查、生产构建通过。前端完整测试 149 项中最初 148 项通过，剩余一项旧文案断言修正后，所在文件 14 项全部通过。两轮独立只读审查未发现阻断问题。沙箱内运行测试曾因临时目录权限和本机端口访问限制失败，最终在普通本机权限下运行现有隔离测试；不涉及生产写入。
