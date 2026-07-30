# 作品预览卡片实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 强化空间入口身份，将空间作品和有效个人作品显示为带安全实时预览的卡片，并完善新建空间表单的必填与网址帮助提示。

**Architecture:** 服务端只在空间入口响应中补充上传者显示名，不修改数据库。前端新增一个共享 `WorkPreviewCard`，空间入口页和上传页分别提供上传者或到期时间作为卡片元信息；预览使用无脚本权限的懒加载 `iframe`。上传页复用现有个人作品接口，并在前端只显示仍可访问的记录。

**Tech Stack:** Express 5、Prisma 6、Vitest、Supertest、React 19、React Router、Testing Library、TypeScript、CSS。

## Global Constraints

- 实时预览不生成或保存截图，不新增后台任务或存储目录。
- 预览 `iframe` 不授予脚本权限，不能操作 Drop & Share 主页面。
- 上传页只展示未删除、未到期且当前可见的个人作品。
- 已到期、已删除或隐藏的记录继续只在个人控制台展示。
- 不新增数据库字段，不创建数据库迁移，不升级依赖。
- 空间入口只公开上传者用户名或“匿名”，不公开手机号、密码或其他账号信息。
- 视觉继续使用现有深蓝、白色和品牌蓝。

---

## 文件结构

- `server/src/routes.spaces.ts`：为空间入口作品补充上传者显示名。
- `server/src/routes.spaces.test.ts`：验证登录上传者和匿名上传者的公开响应。
- `web/src/components/WorkPreviewCard.tsx`：共享的实时预览卡片。
- `web/src/components/WorkPreviewCard.test.tsx`：验证安全预览、元信息和访问入口。
- `web/src/pages/SpaceEntryPage.tsx`：强化空间标题并用卡片显示空间作品。
- `web/src/pages/SpaceEntryPage.test.tsx`：验证空间标题和作品卡片。
- `web/src/pages/UploadPage.tsx`：为登录用户加载有效个人作品，为匿名用户显示注册提示。
- `web/src/pages/UploadPage.test.tsx`：验证个人作品过滤、刷新和匿名提示。
- `web/src/components/CreateSpaceModal.tsx`：添加必填星号和可访问的网址帮助提示。
- `web/src/components/CreateSpaceModal.test.tsx`：验证必填标记以及悬浮、聚焦提示。
- `web/src/styles.css`：空间标题、作品卡片网格、实时预览和帮助提示样式。

---

### Task 1: 空间入口返回上传者显示名

**Files:**
- Modify: `server/src/routes.spaces.ts`
- Test: `server/src/routes.spaces.test.ts`

**Interfaces:**
- Consumes: Prisma `Deployment.owner` 关系。
- Produces: `GET /api/spaces/entry/:slug` 的每个作品增加 `uploaderName: string`。

- [ ] **Step 1: 写失败测试**

在 `server/src/routes.spaces.test.ts` 中加入：

```ts
it("returns a safe uploader label for public space works", async () => {
  vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
  vi.mocked(prisma.deployment.findMany).mockResolvedValue([
    {
      id: "d1",
      title: "登录作品",
      publicSlug: "signed-work",
      ownerUserId: "user-1",
      visibility: "visible",
      owner: { username: "member" },
    },
    {
      id: "d2",
      title: "匿名作品",
      publicSlug: "anonymous-work",
      ownerUserId: null,
      visibility: "visible",
      owner: null,
    },
  ] as never);

  const response = await request(createApp()).get("/api/spaces/entry/portfolio");

  expect(response.status).toBe(200);
  expect(prisma.deployment.findMany).toHaveBeenCalledWith(expect.objectContaining({
    include: {
      owner: {
        select: { username: true },
      },
    },
  }));
  expect(response.body.deployments).toEqual([
    {
      id: "d1",
      title: "登录作品",
      publicSlug: "signed-work",
      ownerUserId: "user-1",
      uploaderName: "member",
    },
    {
      id: "d2",
      title: "匿名作品",
      publicSlug: "anonymous-work",
      ownerUserId: null,
      uploaderName: "匿名",
    },
  ]);
  expect(response.body.deployments[0]).not.toHaveProperty("owner");
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```powershell
cd server
npm.cmd test -- src/routes.spaces.test.ts
```

Expected: FAIL，因为查询尚未包含 `owner`，响应也没有 `uploaderName`。

- [ ] **Step 3: 最小实现**

把空间入口的作品查询改为：

```ts
const deployments = await prisma.deployment.findMany({
  where: {
    spaceId: space.id,
    deletedAt: null,
  },
  include: {
    owner: {
      select: { username: true },
    },
  },
  orderBy: { createdAt: "desc" },
});
```

把公开响应映射改为：

```ts
deployments: visible.map((deployment) => ({
  id: deployment.id,
  title: deployment.title,
  publicSlug: deployment.publicSlug,
  ownerUserId: deployment.ownerUserId,
  uploaderName: deployment.owner?.username ?? "匿名",
})),
```

- [ ] **Step 4: 运行服务端目标测试**

Run:

```powershell
cd server
npm.cmd test -- src/routes.spaces.test.ts
```

Expected: `routes.spaces.test.ts` 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add server/src/routes.spaces.ts server/src/routes.spaces.test.ts
git commit -m "Show space work uploaders"
```

---

### Task 2: 共享实时作品预览卡片

**Files:**
- Create: `web/src/components/WorkPreviewCard.tsx`
- Create: `web/src/components/WorkPreviewCard.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Produces:

```ts
type WorkPreviewCardProps = {
  title: string;
  publicSlug: string;
  meta: ReactNode;
  actions?: ReactNode;
};
```

- [ ] **Step 1: 写失败测试**

创建 `web/src/components/WorkPreviewCard.test.tsx`：

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkPreviewCard } from "./WorkPreviewCard";

afterEach(cleanup);

describe("WorkPreviewCard", () => {
  it("shows a sandboxed lazy preview and a separate visit link", () => {
    render(
      <WorkPreviewCard
        title="课程作品"
        publicSlug="course-work"
        meta="上传者：member"
        actions={<button type="button">关闭</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "课程作品" })).toBeInTheDocument();
    expect(screen.getByText("上传者：member")).toBeInTheDocument();
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute("src", "/p/course-work");
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute("loading", "lazy");
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute("sandbox", "");
    expect(screen.getByRole("link", { name: "打开课程作品" })).toHaveAttribute(
      "href",
      "/p/course-work",
    );
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```powershell
cd web
npm.cmd test -- src/components/WorkPreviewCard.test.tsx
```

Expected: FAIL，因为 `WorkPreviewCard` 尚不存在。

- [ ] **Step 3: 创建最小组件**

创建 `web/src/components/WorkPreviewCard.tsx`：

```tsx
import type { ReactNode } from "react";

type WorkPreviewCardProps = {
  title: string;
  publicSlug: string;
  meta: ReactNode;
  actions?: ReactNode;
};

export function WorkPreviewCard({
  title,
  publicSlug,
  meta,
  actions,
}: WorkPreviewCardProps) {
  const href = `/p/${publicSlug}`;

  return (
    <article className="work-preview-card">
      <div className="work-preview-frame" aria-hidden="true">
        <iframe
          title={`${title}预览`}
          src={href}
          loading="lazy"
          sandbox=""
          tabIndex={-1}
        />
      </div>
      <div className="work-preview-body">
        <h3>{title}</h3>
        <div className="work-preview-meta">{meta}</div>
        <div className="work-preview-actions">
          <a href={href} target="_blank" rel="noreferrer" aria-label={`打开${title}`}>
            打开作品
          </a>
          {actions}
        </div>
      </div>
    </article>
  );
}
```

在 `web/src/styles.css` 中加入：

```css
.work-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 22px;
  margin-top: 18px;
}

.work-preview-card {
  overflow: hidden;
  border: 1px solid #dbe4f3;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 14px 34px rgba(15, 28, 54, 0.08);
}

.work-preview-frame {
  position: relative;
  height: 190px;
  overflow: hidden;
  border-bottom: 1px solid #dbe4f3;
  background: #eef3fb;
}

.work-preview-frame::before {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0;
  left: 0;
  height: 8px;
  content: "";
  background: #4b6fff;
}

.work-preview-frame iframe {
  width: 1280px;
  height: 760px;
  border: 0;
  pointer-events: none;
  transform: scale(0.25);
  transform-origin: top left;
}

.work-preview-body {
  padding: 18px;
}

.work-preview-body h3 {
  margin: 0;
  color: #101b35;
  font-size: 1.18rem;
}

.work-preview-meta {
  margin-top: 8px;
  color: #68758d;
  font-size: 0.92rem;
}

.work-preview-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.work-preview-actions a {
  color: #315cff;
  font-weight: 700;
  text-decoration: none;
}
```

- [ ] **Step 4: 运行组件测试**

Run:

```powershell
cd web
npm.cmd test -- src/components/WorkPreviewCard.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add web/src/components/WorkPreviewCard.tsx web/src/components/WorkPreviewCard.test.tsx web/src/styles.css
git commit -m "Add shared work preview cards"
```

---

### Task 3: 重做空间入口标题和作品区域

**Files:**
- Modify: `web/src/pages/SpaceEntryPage.tsx`
- Modify: `web/src/pages/SpaceEntryPage.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `WorkPreviewCard` 和空间入口返回的 `uploaderName`。
- Produces: 醒目的空间标题、作品卡片网格和无作品空状态。

- [ ] **Step 1: 写失败测试**

在 `web/src/pages/SpaceEntryPage.test.tsx` 增加一个返回作品的测试，并把原标题断言调整为独立空间名称：

```tsx
it("highlights the space name and renders works as preview cards", async () => {
  vi.spyOn(api, "get").mockResolvedValue({
    data: {
      space: {
        id: "space-1",
        name: "八年级作品展",
        slug: "demo",
        expiresAt: "2027-07-30T01:00:00.000Z",
      },
      deployments: [{
        id: "d1",
        title: "我的作品",
        publicSlug: "my-work",
        ownerUserId: "u1",
        uploaderName: "member",
      }],
    },
  });

  renderSpaceEntry();

  expect(await screen.findByText("作品空间")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "八年级作品展" }))
    .toHaveClass("space-entry-title");
  expect(screen.getByRole("heading", { name: "我的作品" })).toBeInTheDocument();
  expect(screen.getByText("上传者：member")).toBeInTheDocument();
  expect(screen.getByTitle("我的作品预览")).toHaveAttribute("sandbox", "");
});
```

并将原测试中的标题断言改为：

```tsx
expect(await screen.findByRole("heading", { level: 1, name: "作品空间" }))
  .toBeInTheDocument();
expect(screen.getByText("这个空间还没有作品")).toBeInTheDocument();
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```powershell
cd web
npm.cmd test -- src/pages/SpaceEntryPage.test.tsx
```

Expected: FAIL，因为页面仍使用组合标题和列表。

- [ ] **Step 3: 最小实现**

在 `SpaceEntryPage.tsx` 中：

```tsx
import { WorkPreviewCard } from "../components/WorkPreviewCard";
```

扩展作品类型：

```ts
type DeploymentItem = {
  id: string;
  title: string;
  publicSlug: string;
  ownerUserId: string | null;
  uploaderName: string;
};
```

用以下标题结构替换原标题和说明：

```tsx
<header className="space-entry-hero">
  <span className="space-entry-eyebrow">作品空间</span>
  <h1 className="space-entry-title">{data.space.name}</h1>
  <p className="space-entry-expiration">
    空间内作品统一于 {new Date(data.space.expiresAt).toLocaleString()} 到期
  </p>
</header>
```

用以下区域替换 `deployment-list`：

```tsx
<section className="space-work-section" aria-labelledby="space-work-title">
  <h2 id="space-work-title">空间内作品</h2>
  {data.deployments.length === 0 ? (
    <p className="empty-state">这个空间还没有作品</p>
  ) : (
    <div className="work-card-grid">
      {data.deployments.map((deployment) => (
        <WorkPreviewCard
          key={deployment.id}
          title={deployment.title}
          publicSlug={deployment.publicSlug}
          meta={`上传者：${deployment.uploaderName}`}
          actions={
            currentUser && deployment.ownerUserId === currentUser.id ? (
              <button
                type="button"
                className="btn-close"
                onClick={() => closeDeployment(deployment.id)}
              >
                关闭
              </button>
            ) : undefined
          }
        />
      ))}
    </div>
  )}
</section>
```

在 `styles.css` 中加入：

```css
.space-entry-hero {
  margin-bottom: 28px;
  padding: 12px 0 24px;
  border-bottom: 1px solid #e4eaf4;
}

.space-entry-eyebrow {
  color: #4b6fff;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.space-entry-title {
  margin: 8px 0 10px;
  color: #0d1932;
  font-size: clamp(2.2rem, 5vw, 4.4rem);
  line-height: 1;
  letter-spacing: -0.04em;
}

.space-entry-expiration {
  margin: 0;
  color: #65728a;
}

.space-work-section {
  margin-top: 38px;
}
```

- [ ] **Step 4: 运行空间入口测试**

Run:

```powershell
cd web
npm.cmd test -- src/pages/SpaceEntryPage.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add web/src/pages/SpaceEntryPage.tsx web/src/pages/SpaceEntryPage.test.tsx web/src/styles.css
git commit -m "Show space works as preview cards"
```

---

### Task 4: 在上传页显示有效个人作品

**Files:**
- Modify: `web/src/pages/UploadPage.tsx`
- Modify: `web/src/pages/UploadPage.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `GET /api/deployments`、`PersonalDeployment`、`WorkPreviewCard`。
- Produces: 登录用户的有效个人作品区；匿名用户的注册提示。

- [ ] **Step 1: 写匿名提示失败测试**

在匿名用户测试中增加：

```tsx
expect(screen.getByText("注册登录后，即可管理自己上传的所有作品。"))
  .toBeInTheDocument();
expect(screen.getByRole("link", { name: "登录/注册，管理作品" }))
  .toHaveAttribute("href", "/login");
expect(getSpy).not.toHaveBeenCalled();
```

- [ ] **Step 2: 写登录用户过滤失败测试**

加入：

```tsx
it("shows only accessible personal works as preview cards", async () => {
  signIn();
  vi.spyOn(api, "get").mockImplementation(async (url) => {
    if (url === "/spaces") return { data: [activeSpace] };
    if (url === "/deployments") {
      return {
        data: [
          {
            id: "active",
            title: "有效作品",
            publicSlug: "active-work",
            visibility: "visible",
            createdAt: "2026-07-29T01:00:00.000Z",
            expiresAt: "2099-07-30T01:00:00.000Z",
            deletedAt: null,
          },
          {
            id: "expired",
            title: "过期作品",
            publicSlug: "expired-work",
            visibility: "visible",
            createdAt: "2020-01-01T00:00:00.000Z",
            expiresAt: "2020-01-02T00:00:00.000Z",
            deletedAt: null,
          },
          {
            id: "deleted",
            title: "删除作品",
            publicSlug: "deleted-work",
            visibility: "visible",
            createdAt: "2026-07-29T01:00:00.000Z",
            expiresAt: "2099-07-30T01:00:00.000Z",
            deletedAt: "2026-07-29T02:00:00.000Z",
          },
        ],
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  renderUploadPage();

  expect(await screen.findByRole("heading", { name: "有效作品" })).toBeInTheDocument();
  expect(screen.getByText(/到期时间：/)).toBeInTheDocument();
  expect(screen.getByTitle("有效作品预览")).toBeInTheDocument();
  expect(screen.queryByText("过期作品")).not.toBeInTheDocument();
  expect(screen.queryByText("删除作品")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: 写上传后刷新失败测试**

在登录上传测试中让 `/deployments` 请求返回空数组，并增加：

```tsx
await waitFor(() => {
  expect(getSpy.mock.calls.filter(([url]) => url === "/deployments")).toHaveLength(2);
});
```

- [ ] **Step 4: 运行上传页测试并确认正确失败**

Run:

```powershell
cd web
npm.cmd test -- src/pages/UploadPage.test.tsx
```

Expected: FAIL，因为上传页尚未加载或显示个人作品。

- [ ] **Step 5: 最小实现**

在 `UploadPage.tsx` 增加：

```tsx
import { WorkPreviewCard } from "../components/WorkPreviewCard";
import type { PersonalDeployment, Space } from "../types";
```

增加状态：

```ts
const [personalWorks, setPersonalWorks] = useState<PersonalDeployment[]>([]);
const [personalWorksError, setPersonalWorksError] = useState("");
```

增加加载函数：

```ts
async function loadPersonalWorks() {
  try {
    const { data } = await api.get<PersonalDeployment[]>("/deployments");
    const now = new Date();
    setPersonalWorks(data.filter((deployment) => (
      !deployment.deletedAt
      && deployment.visibility === "visible"
      && new Date(deployment.expiresAt) > now
    )));
    setPersonalWorksError("");
  } catch (error: any) {
    setPersonalWorksError(
      error.response?.data?.message || "个人作品加载失败，请稍后重试。",
    );
  }
}
```

在登录用户初始化时调用：

```ts
void loadPersonalWorks();
```

在 `upload()` 成功后、仅当登录用户时调用：

```ts
if (isLoggedIn) {
  await loadPersonalWorks();
}
```

在页面末尾、`CreateSpaceModal` 之前加入：

```tsx
<section className="upload-work-section" aria-labelledby="upload-work-title">
  {isLoggedIn ? (
    <>
      <h2 id="upload-work-title">我的个人作品</h2>
      {personalWorksError ? (
        <p className="message">{personalWorksError}</p>
      ) : personalWorks.length === 0 ? (
        <p className="empty-state">
          你还没有可访问的个人作品，上传后会显示在这里。
        </p>
      ) : (
        <div className="work-card-grid">
          {personalWorks.map((deployment) => (
            <WorkPreviewCard
              key={deployment.id}
              title={deployment.title}
              publicSlug={deployment.publicSlug}
              meta={`到期时间：${new Date(deployment.expiresAt).toLocaleString()}`}
            />
          ))}
        </div>
      )}
    </>
  ) : (
    <div className="visitor-work-prompt">
      <p>注册登录后，即可管理自己上传的所有作品。</p>
      <Link to="/login" aria-label="登录/注册，管理作品">登录/注册</Link>
    </div>
  )}
</section>
```

在 `styles.css` 中加入：

```css
.upload-work-section {
  margin-top: 42px;
  padding-top: 30px;
  border-top: 1px solid #e4eaf4;
}

.visitor-work-prompt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px;
  border: 1px solid #dbe4f3;
  border-radius: 16px;
  background: #f7f9fd;
}

.visitor-work-prompt p {
  margin: 0;
  color: #4c5b73;
}

.visitor-work-prompt a {
  color: #315cff;
  font-weight: 800;
}
```

更新现有登录用户测试的 `api.get` 模拟，使 `/spaces` 返回空间、`/deployments` 返回个人作品数组，避免不同接口共享错误数据。

- [ ] **Step 6: 运行上传页测试**

Run:

```powershell
cd web
npm.cmd test -- src/pages/UploadPage.test.tsx
```

Expected: PASS。

- [ ] **Step 7: 提交**

```powershell
git add web/src/pages/UploadPage.tsx web/src/pages/UploadPage.test.tsx web/src/styles.css
git commit -m "Show personal work previews on upload page"
```

---

### Task 5: 改进新建空间表单提示

**Files:**
- Modify: `web/src/components/CreateSpaceModal.tsx`
- Modify: `web/src/components/CreateSpaceModal.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Produces: 必填星号；支持鼠标悬浮、键盘聚焦和读屏说明的网址帮助按钮。

- [ ] **Step 1: 写失败测试**

在 `CreateSpaceModal.test.tsx` 加入：

```tsx
it("marks the space name required and explains the optional URL suffix", async () => {
  const user = userEvent.setup();
  render(
    <CreateSpaceModal
      open
      onClose={vi.fn()}
      onCreated={vi.fn()}
    />,
  );

  expect(screen.getByText("*", { selector: ".required-mark" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /空间名称/ })).toBeRequired();
  expect(screen.getByRole("textbox", { name: "自定义网址后缀" })).not.toBeRequired();

  const help = screen.getByRole("button", { name: "查看自定义网址后缀示例" });
  expect(help).toHaveAttribute("aria-describedby", "space-slug-help");
  await user.hover(help);
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "例如填写 my-class，空间网址将是 drop.yaoguosir.com/s/my-class；不填写时系统会随机生成。",
  );
  await user.unhover(help);
  await user.tab();
  while (document.activeElement !== help) {
    await user.tab();
  }
  expect(help).toHaveFocus();
  expect(screen.getByRole("tooltip")).toBeVisible();
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```powershell
cd web
npm.cmd test -- src/components/CreateSpaceModal.test.tsx
```

Expected: FAIL，因为星号、帮助按钮和提示尚不存在。

- [ ] **Step 3: 最小实现**

在组件中增加：

```ts
const [slugHelpVisible, setSlugHelpVisible] = useState(false);
```

把空间名称标签改为：

```tsx
<label>
  <span>
    空间名称 <span className="required-mark" aria-hidden="true">*</span>
  </span>
  <input
    required
    value={name}
    onChange={(event) => setName(event.target.value)}
  />
</label>
```

把网址后缀标签改为：

```tsx
<label>
  <span className="field-label-with-help">
    自定义网址后缀
    <button
      type="button"
      className="field-help-button"
      aria-label="查看自定义网址后缀示例"
      aria-describedby="space-slug-help"
      onMouseEnter={() => setSlugHelpVisible(true)}
      onMouseLeave={() => setSlugHelpVisible(false)}
      onFocus={() => setSlugHelpVisible(true)}
      onBlur={() => setSlugHelpVisible(false)}
    >
      ?
    </button>
    <span
      id="space-slug-help"
      className={`field-help-tooltip${slugHelpVisible ? " is-visible" : ""}`}
      role="tooltip"
    >
      例如填写 my-class，空间网址将是
      drop.yaoguosir.com/s/my-class；不填写时系统会随机生成。
    </span>
  </span>
  <input value={slug} onChange={(event) => setSlug(event.target.value)} />
</label>
```

在 `styles.css` 中加入：

```css
.required-mark {
  color: #d92d20;
  font-weight: 800;
}

.field-label-with-help {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.field-help-button {
  display: inline-grid;
  width: 20px;
  height: 20px;
  padding: 0;
  place-items: center;
  border: 1px solid #c8d0dd;
  border-radius: 50%;
  background: #f5f7fa;
  color: #7d8798;
  font-size: 0.75rem;
  line-height: 1;
}

.field-help-button:hover,
.field-help-button:focus-visible {
  border-color: #4b6fff;
  color: #315cff;
  outline: none;
}

.field-help-tooltip {
  position: absolute;
  z-index: 4;
  bottom: calc(100% + 10px);
  left: 0;
  width: min(320px, 75vw);
  padding: 10px 12px;
  border: 1px solid #dbe4f3;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 28, 54, 0.14);
  color: #4c5b73;
  font-size: 0.84rem;
  line-height: 1.55;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 140ms ease, transform 140ms ease;
}

.field-help-tooltip.is-visible {
  opacity: 1;
  transform: translateY(0);
}
```

- [ ] **Step 4: 运行表单测试**

Run:

```powershell
cd web
npm.cmd test -- src/components/CreateSpaceModal.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add web/src/components/CreateSpaceModal.tsx web/src/components/CreateSpaceModal.test.tsx web/src/styles.css
git commit -m "Clarify space creation fields"
```

---

### Task 6: 全量验证与视觉检查

**Files:**
- Modify only if a test or visual defect directly related to this specification is found.

**Interfaces:**
- Consumes: Tasks 1–5 的最终结果。
- Produces: 可供代码审查和部署的已验证分支。

- [ ] **Step 1: 运行全部服务端测试和构建**

Run:

```powershell
cd server
npm.cmd test
npm.cmd run build
```

Expected: 全部服务端测试 PASS，TypeScript 构建成功。

- [ ] **Step 2: 运行全部前端测试、类型检查和构建**

Run:

```powershell
cd web
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Expected: 全部前端测试 PASS，类型检查与 Vite 构建成功。

- [ ] **Step 3: 启动本地服务并检查关键页面**

使用项目现有本地环境启动服务端和前端，检查：

- `/s/:spaceSlug` 的空间名称是页面唯一大标题。
- 空间作品卡片的预览不能被点击或操作主页面，卡片访问链接正常。
- `/upload` 登录后只显示有效个人作品。
- `/upload` 匿名状态显示注册登录提示。
- 新建空间表单的问号在鼠标悬浮和键盘聚焦时都显示示例。
- 桌面端卡片为多列，窄屏自动变为更少列。

- [ ] **Step 4: 检查变更范围**

Run:

```powershell
git diff origin/main...HEAD --check
git status -sb
git diff --stat origin/main...HEAD
```

Expected: 无空白错误、无未提交文件，变更只涉及设计、计划和本功能文件。
