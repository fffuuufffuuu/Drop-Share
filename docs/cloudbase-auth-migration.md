# CloudBase 账号迁移记录

日期：2026-10-18。状态：接入代码已实现，尚未部署；真实短信验收待用户操作。

## 当前决策

- 迁移前已上线版本已同步 GitHub main：db2c5401934fc6e42ff50fe2a649b6dd424bf664。
- 迁移分支：codex/cloudbase-auth。
- 已创建环境：drop-share-auth-d1f1aub240d4676c，上海、免费体验版、PostgreSQL。控制台显示到期时间 2027-04-18 23:59:59。
- 用户在控制台启用了短信验证码，描述为默认通道、单号码每天 30 条上限。以短信为默认登录方式，邮箱作为可配置备选。
- 更正之前判断：企事业单位资质要求针对自行接入腾讯云短信的通道，不能用于否定 CloudBase 默认短信包。30 条/日是单号码限频，不是赠送额度。
- 当前价目：短信 50 资源点/条，免费版每月 3000 点与其他服务共用。尚未购买个人版、短信包或开启额外计费。
- CloudBase 仅接管身份认证。作品、空间、上传文件、访问统计及业务权限继续使用现有服务器和 MySQL。
- 官方说明自 2026-08-11 后新建环境不再支持云后台。购买个人版不能自动替换现有作品管理后台。

## 接入合同

使用 CloudBase 官方 HTTP API，不新增 SDK 依赖，不需要腾讯云管理员密钥。

- 发送验证码：POST /auth/v1/verification；默认 ANY，手机号规范化为 +86 前缀。
- 验证：POST /auth/v1/verification/verify；按服务器签名的请求上下文选择 signin 或 signup，不能由浏览器替换已验证的手机号或邮箱。
- 当前身份：GET /auth/v1/user/me。验证 ACTIVE 状态、不可变 sub，以及登录时的号码/邮箱一致性；不使用客户端角色或同名用户名领取旧数据。
- 刷新：POST /auth/v1/token，grant_type=refresh_token；保存轮换令牌。多个本页请求合并刷新，支持浏览器 Web Locks 跨标签页协调，旧请求不得覆盖或清除新会话。
- 退出：POST /auth/v1/user/signout。首先清除本地会话，再尽力撤销 CloudBase 会话；网络故障不阻止本地退出。
- 人机验证：服务要求时使用 /captcha/data、/captcha/data/verify，由用户识别图片，再通过 x-captcha-token 请求头重试发送。
- 429 和认证服务故障作为可重试状态处理，不误判为登录失效。

后端配置：AUTH_PROVIDER=cloudbase，CLOUDBASE_ENV_ID=上述环境 ID，CLOUDBASE_LOGIN_METHOD=sms（或 email）。默认 AUTH_PROVIDER=legacy，未配置不会切换线上认证。

## 旧账号和权限

旧用户首次选择“关联旧账号”，同时提供原账号密码及经 CloudBase 验证的新身份。成功后保留原 User.id、用户名、role、作品与空间关联。

身份映射使用 (cloudbaseEnvId, cloudbaseSubject) 唯一索引，列使用 utf8mb4_bin，且代码再次核对精确身份。条件更新防止并发覆盖已有绑定。新用户默认普通 USER，不维护本地密码，不继承 CloudBase 角色为本地管理员。

原密码哈希保留供旧账号一次性证明和回退使用。CloudBase 启用后，旧注册/密码登录接口关闭，旧 JWT 不再用于业务鉴权。切换会使旧登录态失效，已有作品的用户需要重新验证并关联旧账号。

## 生产数据库变更（尚未获批、未执行）

迁移文件：server/prisma/migrations/20261018000000_add_cloudbase_identity/migration.sql。

1. User.passwordHash 改为可空。
2. 新增可空 cloudbaseEnvId、cloudbaseSubject。
3. 新增组合唯一索引；保留现有 ID、密码、角色和所有权关系。

项目规则要求生产数据库迁移明确批准。用户已于 2026-10-18 批准：真实短信验收通过并完整备份后，执行上述生产数据库迁移和登录切换。验收完成前不执行生产迁移。

## 验收和切换

自动测试覆盖伪造/禁用身份、旧 JWT 拒绝、身份大小写、同名领取防护、原子绑定、角色保留、号码请求上下文、短信与邮箱不可混用、限流、刷新竞态、退出竞态、legacy 回退及人机验证交互。本次后端 130 项、前端 99 项测试通过，后端 build、前端 typecheck/build 通过；独立代码复审的问题已修复并复核。这些结果不替代真实服务验收。

真实提供方验收命令（先在 server 目录 npm.cmd run build）：

    node scripts/verify-cloudbase-auth.cjs drop-share-auth-d1f1aub240d4676c

打开 http://127.0.0.1:4051。用户亲自输入手机号和验证码；工具检查发送、登录/注册、刷新、同一身份、退出和令牌撤销。不读取网站数据库，不记录手机号、验证码或令牌，只输出验收阶段。一次验收会在 CloudBase 留下该测试身份，供后续正常绑定；不创建本地网站用户。

生产切换前：真实验收成功、批准上述数据库变更，备份数据库/上传文件/当前版本，保留 server/.env 和 server/storage。新建身份不得使用来历不明的同名用户名自动关联旧账号。部署后用现有管理员完成关联并验收作品权限、空间上传归属、统计及退出，再确认迁移完成。

回退：保留数据库新增列，将 AUTH_PROVIDER 切回 legacy 并恢复旧前端/后端版本；不通过删除身份列回退。旧用户原密码仍有效；新 CloudBase-only 用户不能通过旧密码入口登录。

2026-10-18 首次真实发送失败已定位为手机格式：CloudBase 要求区号后带空格（`+86 138…`），接口实际返回的参数正则也要求空白分隔。发送与注册请求已统一转换为该格式，签名挑战与身份比对仍使用去空格后的号码。验收工具错误输出只保留错误码、HTTP 状态及请求 ID，不输出上游错误描述中的身份信息；修正后的真实短信验收仍待完成。

## 官方依据

- https://cloud.tencent.com/document/product/876/127357
- https://cloud.tencent.com/document/api/876/34822
- https://docs.cloudbase.net/http-api/auth/auth-send-verification
- https://docs.cloudbase.net/authentication-v2/method/sms-login
- https://docs.cloudbase.net/http-api/auth/auth-verify-verification
- https://docs.cloudbase.net/http-api/auth/user-me
- https://docs.cloudbase.net/http-api/auth/auth-grant-token
- https://docs.cloudbase.net/http-api/auth/auth-sign-out

文档描述实现和验收要求，不代表已完成真实收码、生产迁移或上线。
