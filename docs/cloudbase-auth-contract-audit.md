# CloudBase 认证接入契约核对

日期：2026-10-18。范围：Drop-Share 此次手机号 OTP 注册/登录、可配置邮箱备选、身份映射、刷新、退出和验证码。未新增 SDK 依赖、未购买服务、未修改生产数据库。

## 核对方法

交叉检查官方 HTTP 文档、PG 专项说明以及官方发布包源码，避免将文档示例当成必填 schema。此次下载的 `@cloudbase/auth@3.9.1`、`@cloudbase/oauth@3.9.1` 仅用于源码审查，未安装到项目依赖；来源仓库为 [TencentCloudBase/cloudbase-js-sdk](https://github.com/TencentCloudBase/cloudbase-js-sdk)。auth 包 gitHead 为 `764bee6945f3c65ec9b86e81ae474bef20807aea`。

SDK 对照位置：auth `src/index.ts` 的 `signUp`、`formatPhone`、`convertToUser`；oauth `src/auth/models.ts` 的 `UserProfile`、`src/auth/apis.ts` 的 `getUserInfo` / `signOut`，以及 `src/oauth2client/oauth2client.ts` 的请求头与刷新处理。

## 核对结果

| 环节 | 官方契约与当前实现 | 证据与验证边界 |
| --- | --- | --- |
| PG 模式 | 对外 SDK / HTTP 认证接口继续使用 `/auth/v1/*`；数据库选择不要求业务 MySQL 迁走 | [PG 认证说明](https://docs.cloudbase.net/authentication-v2/auth/auth-pg)。实际环境发送、登录/注册和刷新已返回成功；本轮未操作 PG 数据库 |
| 发送 | POST `/verification`，`target: ANY`，手机与邮箱二选一，手机号使用 `+86 ` 加号码 | [发送 API](https://docs.cloudbase.net/http-api/auth/auth-send-verification)、SDK formatPhone；用户已真实收到短信。原实现漏空格已修复 |
| 验证 | POST `/verification/verify`，`verification_id` + 六位 `verification_code`，取得 `verification_token` | [验证 API](https://docs.cloudbase.net/http-api/auth/auth-verify-verification)。浏览器使用服务器签名挑战，不能任意替换号码、环境或用途 |
| 注册/登录 | 依据上游 `is_user` 选择 `/signin` 或 `/signup`；前者传 verification_token，后者再传已验证号码/邮箱；不需要本地新密码 | [登录](https://docs.cloudbase.net/http-api/auth/auth-sign-in)、[注册](https://docs.cloudbase.net/http-api/auth/auth-sign-up)、SDK signUp。新旧身份两种 HTTP 请求链均有离线回归 |
| 用户资料 | GET `/user/me` 携带 Bearer access_token；必须有有效 sub，拒绝 service_account。status 不保证存在，明确返回时只接受 ACTIVE；未设置的空邮箱归一为未提供 | [通用资料示例](https://docs.cloudbase.net/http-api/auth/user-me) 包含 status，但 SDK UserProfile / convertToUser 没有将它设为必填。实际 PG 资料缺 status 已由脱敏诊断确认。不能声称缺失状态就是 ACTIVE |
| 业务身份/权限 | 登录时须与刚验证的手机号/邮箱以及会话 sub 一致；业务请求重新向配置环境确认身份，按 env + sub 精确映射原 User.id；不继承 CloudBase 的 ADMIN 字样 | 属于本站边界。旧 JWT 不能绕过；旧用户必须同时证明原账号密码，不能依用户名自动领取作品；既有测试覆盖原子绑定与角色保留 |
| 刷新 | POST `/token`，grant_type=refresh_token，不附过期 access_token；校验返回 sub，再查资料，保存新 access/refresh 及 expires_in | [刷新 API](https://docs.cloudbase.net/http-api/auth/auth-grant-token)。真实轮换已进行到后续资料校验；前端单页合并刷新、跨页 Web Locks 与竞态保护已有测试 |
| 退出 | POST `/user/signout`，Bearer + `{}`；本地先清会话，服务不可用时仍完成本地退出 | [退出 API](https://docs.cloudbase.net/http-api/auth/auth-sign-out) 明确支持该路径并说明两种令牌失效。SDK 无参数 signOut 走 `/revoke {token}`，带参数走 `/user/signout`；当前采用后者的正式 HTTP 契约，不混用两条路径的参数 |
| 撤销验收 | 退出后原 access 的 `/user/me` 与原 refresh 的 `/token` 均须被上游明确拒绝；格式错误、503 或清理失败不能算作撤销通过 | 修复原工具将任意 400/401/403 当作撤销成功的缺陷。尚待真实服务验收，不以 mock 或退出返回 200 替代 |
| 图形验证 | `/captcha/data` → 人工识别图片 → `/captcha/data/verify` 传 token/key → x-captcha-token 重试发送；不自动识别验证码 | [验证图片 API](https://docs.cloudbase.net/http-api/auth/auth-verify-captcha-data)、[处理指南](https://docs.cloudbase.net/authentication-v2/method/captcha)。对实际环境做了一次无短信结构检查：200，data/type/token/expires_in，data 为图片 data URI；未识别或验证挑战 |
| 请求与错误 | HTTPS、固定环境和路径、10 秒超时、不跟随重定向；不传管理员凭证。429 可重试，故障不清掉登录；诊断只含错误码、请求 ID、字段类型 | 实际公共 OTP 流程已证明不需要管理员密钥。资料校验不再泄露原始字段，验收输出标明失败阶段；令牌不返回验收浏览器、不写入日志 |

## 本轮检查

- 后端完整测试：21 个文件、148 项通过；后端 TypeScript 构建通过。
- 新增实际 HTTP 适配层与路由联测，使用缺少 status 的资料结构，避免只 mock getCloudbaseUser 而遗漏本次问题。
- 验收覆盖身份不符、服务故障、仍可刷新的会话、清理错误、缺字段但已签发令牌的响应、验收页实际展开的 JavaScript 语法。
- 独立复审发现的已签发令牌清理缺口已修复并补测；复核无剩余重要阻塞。
- 前端代码本轮未修改；此前 99 项测试和 typecheck/build 的结果保留为既有验证。

## 仍需真实确认

下一次真实测试只在上述检查完成后进行：用户亲自收码；依次验证资料、刷新、退出以及两种令牌撤销。若任何阶段失败，按阶段与脱敏错误码排查，不能宣布验收通过或开始生产迁移。

生产迁移及切换已获用户条件批准：真实验收通过、数据库/上传文件/当前版本完整备份后执行，保留生产 `.env` 和 `storage`。本记录不表示已完成生产上线。
