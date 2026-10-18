# 多种登录方式与账号绑定

2026-10-18。沿用已上线的 CloudBase 环境与本地 env + sub 身份映射，新增邮箱验证码和 CloudBase 密码登录入口；手机号验证码及旧账号关联保留。无数据库迁移、依赖升级或付费套餐变更。

## 用户行为

- 登录页提供手机验证码、邮箱验证码、账号密码。新用户先用手机或邮箱验证码验证后自动注册；用户名密码单独注册不开放。
- 旧网站用户首次使用验证码时选择“关联旧账号”，同时验证旧用户名、旧密码及新联系方式；已绑定用户直接登录。
- 控制台 → 账号设置：验证当前已绑定的手机或邮箱后，可绑定另一种联系方式、保存 CloudBase 登录用户名、设置或重置 CloudBase 密码。用户名和密码独立保存，避免部分成功却显示整体失败。
- 作品昵称与 CloudBase 登录用户名分开；作品、空间和角色继续绑定原本的本地 User.id。旧密码不会自动导入 CloudBase。
- 手机与邮箱必须先在账号设置中绑定后才能共用账号；分别在登录页注册会产生两个独立身份。已被其他账号使用的联系方式不自动转移或合并。

## 契约依据

以官方 SDK 发布包 `@cloudbase/auth@3.9.1` 与 `@cloudbase/oauth@3.9.1` 的实际请求格式为准，交叉核对官方文档。下载仅用于核对，未加入项目依赖。

| 功能 | 实际请求 |
| --- | --- |
| 密码登录 | POST `/auth/v1/signin`，username + password；手机号格式为 `+86 ` 加号码，邮箱小写 |
| 当前身份验证 | POST `/verification`，target=`CUR_USER`，使用 `/user/me` 中已绑定的联系方式和当前 Bearer token；POST `/verification/verify` 获得 verification_token |
| 二次授权 | POST `/user/sudo`，verification_token + 当前 Bearer token，获得 sudo_token；本站将其封装为有效期 10 分钟、绑定环境与 sub 的用途专用证明 |
| 绑定联系方式 | 新联系方式先发送与验证 OTP，再 PATCH `/user/contact`，传联系方式、verification_token、sudo_token、conflict_resolution=`DEFAULT`；读取 `/user/me` 确认 sub 和联系方式 |
| 设置密码 | PATCH `/user/password`，new_password + sudo_token + 当前 Bearer token；不写本地 passwordHash |
| 登录用户名 | POST `/user/basic/edit`，仅允许 username；本站另要求当前身份二次验证、排除其他本地用户保留名并读回确认结果 |

HTTP 文档中修改密码页面描述 `verify_code`；SDK 3.9.1 的 `reauthenticate` 实际使用 verification → sudo → PATCH password 的链路，当前实现采用后者，不能将两套参数混用。源码位置：auth `src/index.ts` 的 signInWithPassword、reauthenticate、bindPhoneNumber、bindEmail；oauth `src/auth/apis.ts` 的 setPassword、sudo、editContact、updateUserBasicInfo 及 `src/auth/consts.ts`。

参考：[SDK 源码](https://github.com/TencentCloudBase/cloudbase-js-sdk)、[密码登录](https://docs.cloudbase.net/http-api/auth/auth-sign-in)、[注册](https://docs.cloudbase.net/http-api/auth/auth-sign-up)、[账户关联](https://docs.cloudbase.net/authentication-v2/auth/account-linking)、[修改基础信息](https://docs.cloudbase.net/http-api/auth/user-edit-user-basic-info)。

## 验证边界

离线测试验证 SDK 请求链、Bearer header、签名挑战的用途/环境/sub、原身份和角色映射、账号冲突拒绝、密码修改不改变用户名、前端切换清除旧挑战及二次验证之前禁止操作。真实短信/邮箱接收、提供方密码策略和修改后会话行为，需要用户亲自在正式站验收。不得将 mock 提供方测试当作真实服务验收。
