# 用户头像

CloudBase Auth 是头像资料来源，`User.avatarUrl` 是供评论、上传者和空间贡献者批量返回的可空缓存。原账号迁移、身份关联及权限规则不变。

## 官方接口契约

- [当前用户资料](https://docs.cloudbase.net/http-api/auth/user-me)：GET `/auth/v1/user/me`，头像字段是 `picture`。缺失、null、空值或非 HTTP(S) 地址作为无头像，不要求此字段才能登录。
- [修改基础资料](https://docs.cloudbase.net/http-api/auth/user-edit-user-basic-info)：文档明确为 **POST** `/auth/v1/user/basic/edit`，头像请求字段为 **avatar_url**，携带当前用户 Bearer token。因此本实现没有猜测 PATCH `/user` 或内部上传接口。请求仅传 avatar_url，不修改 username、联系方式或身份。
- 更新后必须再次 GET `/user/me`，确认 sub 未变且 picture 等于新 URL，才写本地缓存。没有使用管理员凭据或真实验证码。

## 应用 API

POST `/api/auth/account/avatar`，当前 CloudBase 用户认证，JSON：

```json
{ "mimeType": "image/png", "data": "<不含 data: 前缀的 base64>" }
```

支持 PNG、JPEG、WebP、GIF，原文件最多 2 MiB，解码最多 1600 万像素。验证 MIME 与实际格式一致，使用现有 Sharp 去除元数据、取首帧并转换为最多 256×256 WebP。返回 `{ avatarUrl }`。不支持外部 URL 输入、SVG、客户端指定路径或替他人设置。CloudBase 未启用返回 404；验证失败返回 400；云端更新、读回或缓存写入失败返回 503，界面明确提示未确认，不能报告成功。

文件位于 `UPLOAD_ROOT/avatars/<用户ID的SHA256>/<随机UUID>.webp`，通过 GET `/api/avatars/:user/:file` 提供只读图片响应。使用配置中的 BASE_URL 生成稳定绝对 URL；部署时须确保 BASE_URL 是公开 HTTPS 地址，反向代理将 `/api/avatars/` 转发至应用。不暴露 storage 中其他文件。替换产生新 URL，旧 URL 保留；不把用户ID或真实用户名写进文件名。

上传更新使用用户行锁串行化。同一次上传的 CloudBase 与数据库无法构成分布式事务：若上游已成功但后续读取或数据库失败，明确返回 503，保留文件以防云端已引用；下一次登录、refresh 或加载账号资料会从官方 picture 修复缓存。失败/旧头像文件目前保留，后续可增加带宽限期、检查当前资料引用的清理工具，不能直接按上传时间删除。

目前提供上传与替换，没有清除按钮：官方文档未明确 avatar_url 空值的清除语义，不能声称可安全清除。后续需确认官方清除契约再开放。没有头像或图片加载失败时，统一圆形首字：Latin 字母大写，其余取首个可见 Unicode 字符；匿名为“匿”。

会话/账号返回 `avatarUrl`；评论返回 `authorAvatarUrl`；空间作品返回 `uploaderAvatarUrl`；贡献者返回 `avatarUrl`（匿名 null）。登录、refresh 和账号资料加载同步 picture；展示其他用户时使用现有批量查询，不增加客户端逐用户请求。旧前端会话缺字段兼容。

## 数据库与发布

新增迁移 `20261116000000_add_user_avatar`，只添加可空 TEXT 列。开发期间没有执行数据库迁移，也不需要开发数据库。生产迁移、备份、发布和真实 CloudBase 集成验收需 Sheng 明确批准，按 AGENTS.md 执行；本任务没有部署或连接生产。依赖及 lockfile 不变。
