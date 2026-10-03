# Drop&Share

Drop&Share 是一个临时网页部署与作品空间工具。上传 HTML 文件或静态网站文件夹后，系统会保存文件、生成公开访问地址，并在到期后自动清理部署内容。

线上地址：**[https://drop.yaoguosir.com/](https://drop.yaoguosir.com/)**

## 功能

- 匿名上传单个 HTML 或静态网站文件夹，默认保留 1 天。
- 注册用户登录后上传个人作品，个人作品保留时间可设置为 1 至 30 天。
- 创建作品空间，空间保留时间最长为 365 天。
- 通过 `/s/{spaceSlug}` 分享空间入口，让多人向同一个空间上传作品。
- 上传单个 HTML、多个 HTML，或整组选中的文件夹；文件和文件夹会按原始名称生成默认作品名称。
- 空间管理支持批量上传、显示/隐藏、删除、重命名、标签筛选和批量添加标签。
- 空间创建者可以控制访客是否下载空间内作品；公开入口支持作品预览和 ZIP 下载。
- 总管理员可以管理作品和空间、恢复显示状态、批量处理标签，以及永久删除内容。
- 定时清理已过期的作品和存储目录。

## 访问地址

| 用途 | 地址 |
| --- | --- |
| 网站首页 | `https://drop.yaoguosir.com/` |
| 作品预览 | `/p/{publicSlug}/` |
| 作品空间入口 | `/s/{spaceSlug}` |
| 登录后个人控制台 | 网站内的“我的上传” |
| 总管理员后台 | `/admin` |

## 项目结构

```text
server/   Node.js + TypeScript + Express + Prisma 后端
web/      React + TypeScript + Vite 前端
design/   Logo 和设计素材
docs/     项目文档
```

## 本地开发

### 后端

```bash
cd server
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

后端默认监听 `http://localhost:4000`。

### 前端

```bash
cd web
npm install
npm run dev
```

前端默认地址为 `http://localhost:5173`。本地开发时，前端会自动把 API 请求发送到 `http://localhost:4000/api`；部署到域名后使用同域 `/api`。

## 环境变量

`server/.env` 至少需要配置：

```dotenv
PORT=4000
DATABASE_URL=mysql://user:password@127.0.0.1:3306/drop_share
JWT_SECRET=replace-with-a-long-random-secret
BASE_URL=http://localhost:4000
DEFAULT_EXPIRES_HOURS=3
UPLOAD_ROOT=./storage
```

`SMS_PROVIDER` 为预留配置项。生产环境请使用独立的数据库、随机的 `JWT_SECRET`，并保护 `server/.env` 与 `server/storage`。

## 验证命令

```bash
cd server
npm test
npm run build

cd ../web
npm test
npm run typecheck
npm run build
```

## 生产部署

生产环境使用 Node.js 后端、Nginx 反向代理和 Prisma 数据库。部署前应备份数据库、`server/storage` 和当前前端版本；部署时保留生产环境的 `server/.env` 与 `server/storage`，不要把凭据、数据库导出、上传文件或构建产物提交到 Git。

Nginx 配置示例见 [`server/deploy/nginx.conf.example`](server/deploy/nginx.conf.example)。其中 `/api/` 代理到后端，`/p/` 用于作品预览，其余请求由前端静态文件处理。

## 许可证

当前仓库未声明开源许可证。若要对外分发或二次开发，请先确认项目授权范围。
