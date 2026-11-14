# 云端开发

## 目录与版本

- GitHub：`https://github.com/fffuuufffuuu/Drop-Share`，主分支 `main`。
- 云端开发：`codexadmin@110.42.231.29:/home/codexadmin/projects/drop`。
- 线上应用：`/www/wwwroot/drop.yaoguosir.com`。开发和验证不在这个目录执行。
- 开发源码、测试、项目规则和发布记录通过 Git 同步。密钥、`.env`、数据库、用户上传文件、依赖和构建产物不进入 Git。

## Node 与依赖

服务器已有与 `.node-version` 一致的 Node.js 22.23.1。每次 SSH 会话先设置：

```bash
export PATH=/home/codexadmin/.local/node/bin:$PATH
cd /home/codexadmin/projects/drop
node --version
```

首次初始化或 lockfile 变化时，按顺序安装已锁定的开发依赖：

```bash
cd server
npm ci --no-audit --no-fund
npm run prisma:generate
cd ../web
npm ci --no-audit --no-fund
```

不要从 Windows 复制 `node_modules`。`prisma generate` 只生成客户端，不迁移数据库。

## 验证

该云主机内存较小，前后端验证依次执行，测试使用一个 worker：

```bash
cd /home/codexadmin/projects/drop/server
npm run build
npm test -- --maxWorkers=1
cd ../web
npm run typecheck
npm run build
npm test -- --run --maxWorkers=1
```

测试使用 mock 数据和临时目录，不需要生产数据库、真实验证码或生产用户上传文件。

## 运行环境边界

本次同步只更新开发仓库、安装锁定依赖并验证。没有配置开发数据库或 CloudBase 测试环境，没有复制生产 `.env`、上传文件或启动常驻开发服务，也没有配置远程 Codex 登录。

实际运行前配置独立的测试数据库、开发密钥和上传目录，并确认开发端口未被线上服务占用。当前前端在 localhost 下固定请求 `http://localhost:4000/api`；若更换后端端口，需同步处理前端 API 地址或 SSH 转发，不能直接把开发页面连到生产 API。

换电脑时可通过 SSH 使用此目录，不需要复制旧电脑的聊天记录。客户端的 SSH 凭证和远程 Codex 安装、登录需要单独配置。

## 2026-11-14 同步记录

将本机此前已于 11 月 7 日发布、但尚未提交的手机号/邮箱登录、中文昵称、账号设置、首页分流改动，以及对应测试、发布记录和模拟页面截图纳入 Git。云端原开发分支为 `bf1f4db`；更新前在云端保留 `backup/pre-sync-20261114` 分支作为恢复点。

本机后端 build 与全部 263 项测试通过；前端 typecheck/build 与全部 168 项测试通过。后端最初在沙箱中因本机回环连接 `EACCES` 失败，允许本机测试连接后全部通过，无应用代码修正。

本次不进行线上部署、生产数据库迁移或依赖版本升级。同步后的精确版本以 `git rev-parse HEAD` 和 GitHub `main` 为准。
