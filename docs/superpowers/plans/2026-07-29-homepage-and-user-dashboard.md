# Drop&Share 新首页与用户控制台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加以“免费使用”为主要入口的新首页，并让登录用户通过用户名进入可分别查看个人上传历史和管理空间的控制台。

**Architecture:** 将原上传页从 `/` 移到 `/upload`，新增独立的 `HomePage`，由 `App` 根据本地登录状态呈现导航。服务端在现有部署路由中增加只读取当前账号、且不属于空间的历史查询；控制台消费该接口并在前端根据删除时间、到期时间和可见性显示互斥状态。

**Tech Stack:** React 19、React Router 7、TypeScript、Vitest、Testing Library、Express 5、Prisma、Supertest

## Global Constraints

- 首页主要按钮文案必须是“免费使用”，不得出现“免费试用”。
- 匿名上传说明为默认 3 小时；登录用户说明为可选 1–24 小时，不得宣传永久保存。
- “我的上传”只包含当前账号直接上传的个人网页，不包含匿名上传和空间网页。
- 已到期或已删除的个人记录继续显示，并与正常、隐藏状态明确区分。
- 状态优先级固定为：已删除、已过期、已隐藏、正常。
- 用户名点击进入 `/dashboard`；未登录时右上角显示“登录/注册”。
- 管理员继续看到“管理后台”入口。
- 个人历史权限必须由服务器验证，客户端不得传入或选择用户 ID。
- 不新增数据库迁移，不升级依赖。
- 不连接或修改生产服务器，不部署，不提交环境变量、数据库、上传文件、备份或凭证。
- 每项功能先写失败测试，再做最小实现，通过验证后单独提交。

---

### Task 1: 当前用户个人上传历史接口

**Files:**
- Create: `server/src/routes.deployments.test.ts`
- Modify: `server/src/routes.deployments.ts`

**Interfaces:**
- Consumes: `requireAuth` 提供的 `req.authUser.userId: string`
- Produces: `GET /api/deployments`，返回 `{ id, title, publicSlug, visibility, createdAt, expiresAt, deletedAt }[]`

- [ ] **Step 1: 写出个人历史查询的失败测试**

```ts
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { deploymentRouter } from "./routes.deployments";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("./middleware", () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers.authorization) {
      res.status(401).json({ message: "Missing token" });
      return;
    }
    req.authUser = { userId: "user-1", username: "member" };
    next();
  },
}));

function createApp() {
  const app = express();
  app.use("/api/deployments", deploymentRouter);
  return app;
}

describe("personal deployment history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a request without a logged-in user", async () => {
    const response = await request(createApp()).get("/api/deployments");

    expect(response.status).toBe(401);
    expect(prisma.deployment.findMany).not.toHaveBeenCalled();
  });

  it("returns only the current user's direct uploads including expired and deleted history", async () => {
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([
      {
        id: "deployment-1",
        title: "个人首页",
        publicSlug: "personal-home",
        visibility: "visible",
        createdAt: new Date("2026-07-28T01:00:00.000Z"),
        expiresAt: new Date("2026-07-29T01:00:00.000Z"),
        deletedAt: new Date("2026-07-29T02:00:00.000Z"),
        rootPath: "C:/private/storage",
      },
    ] as never);

    const response = await request(createApp())
      .get("/api/deployments")
      .set("Authorization", "Bearer user-token");

    expect(response.status).toBe(200);
    expect(prisma.deployment.findMany).toHaveBeenCalledWith({
      where: {
        ownerUserId: "user-1",
        spaceId: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        publicSlug: true,
        visibility: true,
        createdAt: true,
        expiresAt: true,
        deletedAt: true,
      },
    });
    expect(response.body[0]).toMatchObject({
      id: "deployment-1",
      deletedAt: "2026-07-29T02:00:00.000Z",
    });
    expect(response.body[0]).not.toHaveProperty("rootPath");
  });
});
```

- [ ] **Step 2: 运行新测试并确认失败**

Run: `cd server && npm test -- src/routes.deployments.test.ts`

Expected: FAIL，已登录请求得到 `404`，因为 `GET /api/deployments` 尚不存在。

- [ ] **Step 3: 增加最小查询接口**

在 `deploymentRouter` 创建后、上传接口之前加入：

```ts
deploymentRouter.get("/", requireAuth, async (req, res) => {
  const deployments = await prisma.deployment.findMany({
    where: {
      ownerUserId: req.authUser!.userId,
      spaceId: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      publicSlug: true,
      visibility: true,
      createdAt: true,
      expiresAt: true,
      deletedAt: true,
    },
  });

  res.json(deployments);
});
```

- [ ] **Step 4: 运行接口测试与服务端构建**

Run: `cd server && npm test -- src/routes.deployments.test.ts && npm run build`

Expected: 新增的 2 个测试 PASS，TypeScript 构建成功。

- [ ] **Step 5: 提交服务端接口**

```bash
git add server/src/routes.deployments.ts server/src/routes.deployments.test.ts
git commit -m "Add personal deployment history endpoint"
```

---

### Task 2: 新首页、上传地址与登录状态导航

**Files:**
- Create: `web/src/pages/HomePage.tsx`
- Create: `web/src/pages/HomePage.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `getCurrentUser(): CurrentUser | null` 和 `authChangedEvent`
- Produces: `/` 的介绍首页、`/upload` 的上传页，以及按登录状态变化的顶部导航

**Design Direction:**
- Color: `深海军蓝 #0f172a`、`链接蓝 #2563eb`、`浅链接蓝 #dbeafe`、`纸白 #ffffff`、`雾灰 #f3f4f6`、`正文灰 #475569`
- Type: 首页标题使用 `Bahnschrift, "Arial Narrow", "Microsoft YaHei", sans-serif`；正文使用现有中文系统字体；示例网址使用 `Consolas, "SFMono-Regular", monospace`
- Layout: 大标题和操作集中在首屏，发布地址预览作为唯一视觉记忆点，三个能力说明在下方等宽排列，手机端改为单列
- Signature: 以 `drop.yaoguosir.com/p/your-page` 地址预览表达“上传网页后得到链接”这一核心用途

```text
┌────────────────────────────────────────────────────┐
│ DROP & SHARE                                       │
│ 把网页变成一个随时可分享的链接                     │
│ 说明文字                                           │
│ [免费使用] [登录/注册]                             │
│ ┌ 已发布  drop.yaoguosir.com/p/your-page ───────┐ │
│ └───────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
┌ 文件 ─────────┐ ┌ 链接 ─────────┐ ┌ 账号 ─────────┐
│ 上传网页       │ │ 立即分享       │ │ 注册后管理     │
└────────────────┘ └────────────────┘ └────────────────┘
```

- [ ] **Step 1: 写出首页内容与按钮的失败测试**

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { HomePage } from "./HomePage";

afterEach(cleanup);

describe("HomePage", () => {
  it("explains the service and links free use to the uploader", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", {
      name: "把网页变成一个随时可分享的链接",
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "免费使用" })).toHaveAttribute("href", "/upload");
    expect(screen.getByText(/匿名上传默认保留 3 小时/)).toBeInTheDocument();
    expect(screen.getByText(/登录后可选择 1–24 小时/)).toBeInTheDocument();
    expect(screen.queryByText("免费试用")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 写出路由和导航状态的失败测试**

将 `web/src/App.test.tsx` 的 `renderApp` 改为接收地址：

```tsx
function renderApp(initialEntry = "/login") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}
```

增加：

```tsx
it("uses the landing page at root and keeps the uploader at /upload", () => {
  renderApp("/");

  expect(screen.getByRole("heading", {
    name: "把网页变成一个随时可分享的链接",
  })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "免费使用" })).toHaveAttribute("href", "/upload");
});

it("shows login and registration together to a visitor", () => {
  renderApp("/");

  expect(screen.getByRole("link", { name: "登录/注册" })).toHaveAttribute("href", "/login");
});

it("replaces login and registration with the username after login", () => {
  localStorage.setItem("user", JSON.stringify({
    id: "u2",
    username: "member",
    role: "USER",
  }));

  renderApp("/");

  expect(screen.getByRole("link", { name: "member" })).toHaveAttribute("href", "/dashboard");
  expect(screen.queryByRole("link", { name: "登录/注册" })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: 运行首页与导航测试并确认失败**

Run: `cd web && npm test -- src/pages/HomePage.test.tsx src/App.test.tsx`

Expected: FAIL，因为 `HomePage` 尚不存在，根地址仍显示上传页，导航仍显示“登录”。

- [ ] **Step 4: 创建最小首页**

创建 `web/src/pages/HomePage.tsx`：

```tsx
import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="home-page">
      <div className="home-hero">
        <p className="home-eyebrow">DROP & SHARE</p>
        <h2>把网页变成一个随时可分享的链接</h2>
        <p className="home-summary">
          上传单个 HTML 文件或完整网页文件夹，几秒钟内获得可以直接打开和分享的访问链接。
        </p>
        <div className="home-actions">
          <Link className="home-primary-action" to="/upload">免费使用</Link>
          <Link className="home-secondary-action" to="/login">登录/注册</Link>
        </div>
        <div className="home-link-preview" aria-label="示例访问链接">
          <span>已发布</span>
          <code>drop.yaoguosir.com/p/your-page</code>
        </div>
        <p className="home-retention">
          匿名上传默认保留 3 小时；登录后可选择 1–24 小时，并查看自己的上传记录。
        </p>
      </div>
      <div className="home-features" aria-label="主要功能">
        <article>
          <span>文件</span>
          <h3>上传网页</h3>
          <p>支持单个 HTML 文件，也支持包含样式、图片和脚本的完整文件夹。</p>
        </article>
        <article>
          <span>链接</span>
          <h3>立即分享</h3>
          <p>上传完成后立即获得访问链接，无需自行配置服务器。</p>
        </article>
        <article>
          <span>账号</span>
          <h3>注册后管理</h3>
          <p>查看个人上传记录，并用独立空间整理需要集中管理的网页。</p>
        </article>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: 调整路由和导航**

在 `web/src/App.tsx` 导入 `HomePage`，并将导航主体改为：

```tsx
<nav>
  <Link to="/">首页</Link>
  <Link to="/upload">{currentUser ? "上传" : "免费使用"}</Link>
  {currentUser ? (
    <Link to="/dashboard">{currentUser.username}</Link>
  ) : (
    <Link to="/login">登录/注册</Link>
  )}
  {currentUser?.role === "ADMIN" && <Link to="/admin">管理后台</Link>}
</nav>
```

将路由改为：

```tsx
<Route path="/" element={<HomePage />} />
<Route path="/upload" element={<UploadPage />} />
```

其他现有路由保持不变。

- [ ] **Step 6: 加入首页视觉样式**

在 `web/src/styles.css` 增加语义化首页样式，使用现有深色导航和蓝色强调色：

```css
.home-page {
  display: grid;
  gap: 24px;
  padding: 28px 0 48px;
}

.home-hero {
  position: relative;
  overflow: hidden;
  border: 1px solid #dbeafe;
  border-radius: 20px;
  padding: clamp(32px, 7vw, 72px);
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.home-eyebrow {
  margin: 0 0 16px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.home-hero h2 {
  max-width: 700px;
  margin: 0;
  font-family: Bahnschrift, "Arial Narrow", "Microsoft YaHei", sans-serif;
  font-size: clamp(38px, 7vw, 68px);
  line-height: 1.05;
  letter-spacing: -0.04em;
}

.home-summary {
  max-width: 620px;
  margin: 24px 0 0;
  color: #475569;
  font-size: 19px;
  line-height: 1.75;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}

.home-actions a {
  border-radius: 9px;
  padding: 12px 20px;
  font-weight: 700;
  text-decoration: none;
}

.home-primary-action {
  background: #2563eb;
  color: #ffffff;
}

.home-secondary-action {
  border: 1px solid #cbd5e1;
  color: #0f172a;
}

.home-link-preview {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 560px;
  margin-top: 28px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 11px 14px;
  background: #eff6ff;
}

.home-link-preview span {
  border-radius: 999px;
  padding: 3px 8px;
  background: #dcfce7;
  color: #166534;
  font-size: 12px;
  font-weight: 800;
}

.home-link-preview code {
  overflow: hidden;
  color: #1e3a8a;
  font-family: Consolas, "SFMono-Regular", monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-retention {
  margin: 20px 0 0;
  color: #64748b;
  font-size: 14px;
}

.home-features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.home-features article {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 24px;
  background: #ffffff;
}

.home-features span {
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
}

.home-features h3 {
  margin: 16px 0 8px;
}

.home-features p {
  margin: 0;
  color: #64748b;
  line-height: 1.65;
}

@media (max-width: 700px) {
  .navbar {
    align-items: flex-start;
    gap: 16px;
  }

  .navbar nav {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .home-features {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: 运行首页、导航测试与前端类型检查**

Run: `cd web && npm test -- src/pages/HomePage.test.tsx src/App.test.tsx && npm run typecheck`

Expected: 新首页及导航测试 PASS，TypeScript 类型检查成功。

- [ ] **Step 8: 提交新首页和导航**

```bash
git add web/src/pages/HomePage.tsx web/src/pages/HomePage.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/styles.css
git commit -m "Add landing page and account navigation"
```

---

### Task 3: 控制台个人上传历史与状态

**Files:**
- Create: `web/src/pages/DashboardPage.test.tsx`
- Modify: `web/src/pages/DashboardPage.tsx`
- Modify: `web/src/types.ts`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `GET /deployments` 返回的 `PersonalDeployment[]`
- Produces: `getPersonalDeploymentStatus(deployment, now)` 和包含“我的上传”“空间管理”的用户控制台

- [ ] **Step 1: 增加个人历史类型**

在 `web/src/types.ts` 的 `Deployment` 后加入：

```ts
export type PersonalDeployment = Deployment & {
  deletedAt: string | null;
};
```

- [ ] **Step 2: 写出状态优先级的失败测试**

创建 `web/src/pages/DashboardPage.test.tsx`，先加入：

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, setAuthToken } from "../api";
import type { PersonalDeployment } from "../types";
import { DashboardPage, getPersonalDeploymentStatus } from "./DashboardPage";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  setAuthToken: vi.fn(),
}));

const baseDeployment: PersonalDeployment = {
  id: "d1",
  title: "个人首页",
  publicSlug: "personal-home",
  visibility: "visible",
  createdAt: "2026-07-29T01:00:00.000Z",
  expiresAt: "2099-07-30T01:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("token", "user-token");
});

afterEach(cleanup);

describe("personal deployment status", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("prioritizes deleted, expired, hidden, then active", () => {
    expect(getPersonalDeploymentStatus({
      ...baseDeployment,
      deletedAt: "2026-07-29T10:00:00.000Z",
      expiresAt: "2026-07-29T11:00:00.000Z",
      visibility: "hidden",
    }, now)).toBe("已删除");
    expect(getPersonalDeploymentStatus({
      ...baseDeployment,
      expiresAt: "2026-07-29T11:00:00.000Z",
      visibility: "hidden",
    }, now)).toBe("已过期");
    expect(getPersonalDeploymentStatus({
      ...baseDeployment,
      visibility: "hidden",
    }, now)).toBe("已隐藏");
    expect(getPersonalDeploymentStatus(baseDeployment, now)).toBe("正常");
  });
});
```

- [ ] **Step 3: 写出控制台板块和历史显示的失败测试**

继续在同一测试文件加入：

```tsx
describe("DashboardPage", () => {
  it("separates personal uploads from space management and keeps inactive history", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") {
        return {
          data: [
            baseDeployment,
            {
              ...baseDeployment,
              id: "d2",
              title: "过期网页",
              publicSlug: "expired-site",
              expiresAt: "2020-01-01T00:00:00.000Z",
            },
            {
              ...baseDeployment,
              id: "d3",
              title: "删除网页",
              publicSlug: "deleted-site",
              deletedAt: "2026-07-29T02:00:00.000Z",
            },
          ],
        };
      }
      if (url === "/spaces") return { data: [] };
      throw new Error(`unexpected GET ${url}`);
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "我的上传" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "空间管理" })).toBeInTheDocument();
    expect(await screen.findByText("个人首页")).toBeInTheDocument();
    expect(screen.getByText("过期网页")).toBeInTheDocument();
    expect(screen.getByText("删除网页")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "访问个人首页" })).toHaveAttribute(
      "href",
      "/p/personal-home",
    );
    expect(screen.queryByRole("link", { name: "访问过期网页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "访问删除网页" })).not.toBeInTheDocument();
  });

  it("loads spaces only when the space panel is selected", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") return { data: [] };
      if (url === "/spaces") {
        return {
          data: [{
            id: "s1",
            name: "作品空间",
            slug: "portfolio",
            createdAt: "2026-07-29T01:00:00.000Z",
          }],
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/deployments"));
    expect(api.get).not.toHaveBeenCalledWith("/spaces");

    await user.click(screen.getByRole("button", { name: "空间管理" }));

    expect(await screen.findByText("作品空间")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/spaces");
    expect(setAuthToken).toHaveBeenCalledWith("user-token");
  });

  it("clears the account when the user logs out", async () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u1",
      username: "member",
      role: "USER",
    }));
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(setAuthToken).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 4: 运行控制台测试并确认失败**

Run: `cd web && npm test -- src/pages/DashboardPage.test.tsx`

Expected: FAIL，因为状态函数和双板块控制台尚不存在。

- [ ] **Step 5: 实现状态函数和个人历史加载**

在 `DashboardPage.tsx` 中导出：

```ts
export type PersonalDeploymentStatus = "正常" | "已隐藏" | "已过期" | "已删除";

export function getPersonalDeploymentStatus(
  deployment: PersonalDeployment,
  now = new Date(),
): PersonalDeploymentStatus {
  if (deployment.deletedAt) return "已删除";
  if (new Date(deployment.expiresAt) <= now) return "已过期";
  if (deployment.visibility === "hidden") return "已隐藏";
  return "正常";
}
```

在页面组件中从 `react-router-dom` 导入并使用 `useNavigate`，并从 `../auth` 导入 `getCurrentUser` 和 `notifyAuthChanged`。加入退出处理：

```ts
const navigate = useNavigate();

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  setAuthToken();
  notifyAuthChanged();
  navigate("/login");
}
```

为页面加入板块和个人历史状态：

```ts
const [activePanel, setActivePanel] = useState<"uploads" | "spaces">("uploads");
const [deployments, setDeployments] = useState<PersonalDeployment[]>([]);

async function loadDeployments() {
  const token = localStorage.getItem("token");
  if (!token) {
    setMessage("请先登录。");
    return;
  }
  setAuthToken(token);
  try {
    const { data } = await api.get<PersonalDeployment[]>("/deployments");
    setDeployments(data);
  } catch (error: any) {
    setMessage(error.response?.data?.message || "加载个人上传失败");
  }
}

useEffect(() => {
  if (activePanel === "uploads") {
    void loadDeployments();
  } else {
    void loadSpaces();
  }
}, [activePanel]);
```

页面顶部加入账号信息、退出按钮和板块按钮：

```tsx
<header className="dashboard-header">
  <div>
    <p className="dashboard-eyebrow">个人控制台</p>
    <h2>{getCurrentUser()?.username ?? "当前用户"}</h2>
  </div>
  <button type="button" onClick={logout}>退出登录</button>
</header>
<div className="dashboard-tabs" role="tablist" aria-label="控制台板块">
  <button
    type="button"
    className={activePanel === "uploads" ? "dashboard-tab-active" : ""}
    onClick={() => setActivePanel("uploads")}
  >
    我的上传
  </button>
  <button
    type="button"
    className={activePanel === "spaces" ? "dashboard-tab-active" : ""}
    onClick={() => setActivePanel("spaces")}
  >
    空间管理
  </button>
</div>
```

“我的上传”板块按记录渲染：

```tsx
{activePanel === "uploads" && (
  <section className="dashboard-panel">
    <h2>我的上传</h2>
    <p className="hint">这里保留登录后直接上传的个人网页历史，不包含匿名上传或空间网页。</p>
    {deployments.length === 0 ? (
      <p className="hint">还没有个人上传记录。</p>
    ) : (
      <div className="deployment-list">
        {deployments.map((deployment) => {
          const status = getPersonalDeploymentStatus(deployment);
          return (
            <article className="dashboard-deployment" key={deployment.id}>
              <div>
                <h3>{deployment.title}</h3>
                <p>
                  上传：{new Date(deployment.createdAt).toLocaleString()}
                  {" · "}
                  到期：{new Date(deployment.expiresAt).toLocaleString()}
                </p>
              </div>
              <div className="dashboard-deployment-actions">
                <span className={`dashboard-status dashboard-status-${status}`}>{status}</span>
                {status === "正常" && (
                  <a
                    href={`/p/${deployment.publicSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`访问${deployment.title}`}
                  >
                    访问
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    )}
  </section>
)}
```

将现有空间创建和列表放进 `activePanel === "spaces"` 的 `dashboard-panel`，现有行为保持不变。

- [ ] **Step 6: 增加控制台样式**

在 `web/src/styles.css` 增加：

```css
.dashboard-shell {
  overflow: hidden;
  padding: 0;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 24px;
}

.dashboard-header h2,
.dashboard-header p {
  margin: 0;
}

.dashboard-eyebrow {
  margin-bottom: 5px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.dashboard-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid #e2e8f0;
  padding: 14px 20px 0;
  background: #f8fafc;
}

.dashboard-tabs button {
  border-color: transparent;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: #475569;
}

.dashboard-tabs .dashboard-tab-active {
  border-color: #dbeafe;
  border-bottom-color: #ffffff;
  background: #ffffff;
  color: #1d4ed8;
}

.dashboard-panel {
  padding: 24px;
}

.dashboard-deployment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid #e2e8f0;
  padding: 18px 0;
}

.dashboard-deployment h3,
.dashboard-deployment p {
  margin: 0;
}

.dashboard-deployment p {
  margin-top: 7px;
  color: #64748b;
  font-size: 13px;
}

.dashboard-deployment-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-status {
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 700;
}

.dashboard-status-正常 {
  background: #dcfce7;
  color: #166534;
}

.dashboard-status-已隐藏 {
  background: #e2e8f0;
  color: #475569;
}

.dashboard-status-已过期 {
  background: #fef3c7;
  color: #92400e;
}

.dashboard-status-已删除 {
  background: #fee2e2;
  color: #991b1b;
}

@media (max-width: 640px) {
  .dashboard-header,
  .dashboard-deployment {
    align-items: flex-start;
    flex-direction: column;
  }
}
```

- [ ] **Step 7: 运行控制台测试和前端检查**

Run: `cd web && npm test -- src/pages/DashboardPage.test.tsx && npm run typecheck && npm run build`

Expected: 控制台测试 PASS，类型检查和 Vite 构建成功。

- [ ] **Step 8: 提交控制台功能**

```bash
git add web/src/pages/DashboardPage.tsx web/src/pages/DashboardPage.test.tsx web/src/types.ts web/src/styles.css
git commit -m "Show personal upload history in dashboard"
```

---

### Task 4: 全量回归验证

**Files:**
- Verify only; no source files should change

**Interfaces:**
- Consumes: Tasks 1–3 的全部提交
- Produces: 可发布但尚未部署的本地构建结果

- [ ] **Step 1: 检查文案与敏感文件**

Run: `rg -n "免费试用|永久保存" web/src docs/superpowers/specs/2026-07-29-homepage-and-user-dashboard-design.md`

Expected: 无输出。

Run: `git status --short`

Expected: 无 `.env`、数据库、上传文件、备份或凭证。

- [ ] **Step 2: 运行全部服务端测试与构建**

Run: `cd server && npm test && npm run build`

Expected: 全部服务端测试 PASS，TypeScript 构建成功。

- [ ] **Step 3: 运行全部前端测试、类型检查与构建**

Run: `cd web && npm test && npm run typecheck && npm run build`

Expected: 全部前端测试 PASS，类型检查与 Vite 构建成功。

- [ ] **Step 4: 检查提交和工作区**

Run: `git log -4 --oneline && git status --short`

Expected: 设计文档、服务端接口、新首页导航、控制台功能各有独立提交；工作区干净。没有生产部署、生产数据库迁移或生产文件变更。
