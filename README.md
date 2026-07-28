# 临时网页部署工具

一个可部署到云服务器的网页端工具：支持上传单个 HTML 或整个静态站点文件夹，自动生成临时访问 URL，并在到期后自动清理。

## 项目结构

- `server/`: Node.js + TypeScript + Express + Prisma 后端
- `web/`: React + Vite 前端

## 快速启动

### 1) 后端

```bash
cd server
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

默认服务地址：`http://localhost:4000`

### 2) 前端

```bash
cd web
npm run dev
```

默认地址：`http://localhost:5173`

## 核心能力

- 匿名上传：默认 3 小时有效
- 手机号验证码登录：注册用户可设置 1~24 小时
- 空间入口：`/s/{spaceSlug}`，他人可在该入口上传到空间
- 空间管理：显示/隐藏、删除、批量上传
- 自动回收：每 10 分钟清理过期部署并删除磁盘目录

## 生产部署建议

- 反向代理使用 Nginx，并配置 HTTPS（Let's Encrypt）
- 上传目录请挂载独立磁盘，便于扩容和隔离
- 在生产环境设置强随机 `JWT_SECRET`
- 开启服务器级限流/WAF，控制匿名上传频率

Nginx 示例见：`server/deploy/nginx.conf.example`
