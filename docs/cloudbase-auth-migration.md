# CloudBase 账号迁移准备记录

日期：2026-10-18。状态：环境开通准备中，尚未实现或启用新认证。

## 已确认的范围

- 已上线的访问统计及卡片改动已提交到 GitHub `main`，提交 `db2c5401934fc6e42ff50fe2a649b6dd424bf664`。这是账号迁移前的回退基线。
- 迁移工作使用 `codex/cloudbase-auth` 分支。
- 用户选择邮箱验证码注册和登录。此前的手机验证码选择已撤回，不申请短信签名、不购买短信套餐。
- CloudBase 管理登录身份；作品、空间、上传文件、访问次数及其管理功能继续使用现有服务器和 MySQL。
- 不将 CloudBase 控制台视为现有作品管理后台的自动替代品。控制台管理身份，本站仍需执行业务角色和所有权判断。

## 控制台实测

当前账号没有 CloudBase 环境。新版控制台的“新建环境”进入
<https://buy.cloud.tencent.com/CloudBase?buyType=tcb>。

已填环境名称 `drop-share-auth`，地域上海，免费体验版，页面显示 6 个月、总金额 ¥0、资源点 3000，不支持开启按量付费。页面默认选择 PostgreSQL 数据库；环境创建后不能切换数据库类型。这不涉及转换或迁移本站 MySQL。

免费开通必须填写公众号兑换码。用户需要扫描官网二维码，向公众号发送“领取兑换码”。尚未取得兑换码、提交订单或创建环境。不得因免费入口受阻而改选付费版。

创建成功后仍须确认：环境 ID、真实认证端点、邮箱认证是否支持内置邮件代发、当前额度及费用、生产域名配置。不能把旧版 SDK 示例直接用于 PostgreSQL 环境；应按环境控制台提供的接入代码选择对应 API。

## 现有代码约束

- `server/src/routes.auth.ts` 当前维护用户名、bcrypt 密码和本站 JWT；未要求绑定邮箱。
- `server/prisma/schema.prisma` 的 `User.id` 被作品和空间所有权引用，`role` 决定管理员权限。迁移须保留这些用户 ID 和关系。
- `server/src/middleware.ts` 校验本站 JWT；`server/src/routes.spaces.ts` 的空间上传还单独校验可选 JWT。这两处必须统一迁移，否则上传者身份会丢失。
- `web/src/pages/LoginPage.tsx`、`web/src/api.ts`、`web/src/auth.ts` 和退出登录流程必须同时处理新登录态、自动续期和失效。

## 拟采用的绑定方式（待用户确认旧账号过渡要求）

新 CloudBase 身份以环境 ID 和服务端验证后的不可变用户 ID 映射到本地用户。不得仅凭同名用户名、客户端提交的邮箱或角色自动领取旧账号。

旧用户先证明持有原账号，再完成邮箱验证码认证，才能绑定该 CloudBase 身份。绑定应原子执行，阻止一个 CloudBase 身份绑定多个旧用户或覆盖已有绑定。绑定后沿用原 `User.id`、作品、空间、用户名和管理员角色。新注册账号默认普通用户，不能从客户端或身份昵称推导管理员权限。

过渡期间是否保留原密码登录尚未收到用户答复。需要据此确定旧登录入口的关闭时间。验证码登录本身不要求用户另设新密码，也不应上传旧密码哈希。

## 实施与发布验收

1. 开通免费环境并验证邮箱服务的可用性和费用，再确定实际 SDK/API 合同。
2. 增加最小的身份映射数据库变更；本地验证迁移，生产执行前单独取得明确批准。
3. 先验证服务端身份再处理业务请求。无效、其他环境、已禁用身份及认证服务不可用时，不得放行或退回用户名匹配。
4. 接入邮箱验证码、重发限制、验证码错误反馈、会话续期和完整退出；更改邮箱后必须丢弃旧验证上下文。
5. 验证旧用户绑定保留作品和空间；验证新用户、匿名上传、普通用户、管理员的权限边界及角色变更生效。
6. 后端执行 `npm.cmd test`、`npm.cmd run build`；前端执行 `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`。
7. 用真实邮箱完成收码、登录、续期和退出；模拟测试通过不能替代真实环境验收。
8. 生产切换前备份数据库、上传文件和当前版本，保留 `server/.env`、`server/storage`，配置明确的回退入口。仅当真实认证和管理员访问通过后关闭旧注册。

## 官方依据

- [邮箱验证码与内置邮件代发](https://docs.cloudbase.net/authentication-v2/method/email-login)
- [CloudBase HTTP 身份认证](https://docs.cloudbase.net/http-api/auth/user-me)
- [SDK v3 认证](https://docs.cloudbase.net/api-reference/webv3/authentication)
- [短信认证地域和配置要求](https://docs.cloudbase.net/authentication-v2/method/sms-login)
- [国内短信实名资质](https://cloud.tencent.com/document/product/382/108274)
- [CloudBase 计费说明](https://cloud.tencent.com/document/product/876/127357)

价格、免费条件及身份认证合同以实际环境和当时控制台为准；本记录不是已开通或已部署的证明。
