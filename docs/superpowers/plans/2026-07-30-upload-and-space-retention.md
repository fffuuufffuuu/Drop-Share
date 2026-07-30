# Drop & Share 上传与空间留存规则实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将匿名个人上传改为固定 1 天、登录个人上传改为 1–30 天，并让空间拥有唯一的 1–365 天截止时间、到期清空和到期前刷新一年能力。

**Architecture:** `Space.expiresAt` 是空间有效性的唯一依据，所有空间入口、空间作品访问、上传和延长接口都由服务器检查它。`Deployment.expiresAt` 继续服务个人上传；空间作品仅为兼容数据库必填字段写入当时的空间截止时间，但访问和清理绝不依赖该副本。

**Tech Stack:** Express 5、Prisma/MySQL、Vitest、Supertest、React 19、React Router、Testing Library、TypeScript、Vite

## Global Constraints

- 新规则只影响新上传内容，已有个人上传的到期时间不得改变。
- 匿名个人上传固定保留 1 天。
- 登录个人上传允许 1–30 个整数天。
- 新建空间允许 1–365 个整数天。
- 现有空间迁移为“迁移执行时刻 + 365 天”。
- 延长操作只允许空间所有者在到期前执行，并把截止时间设为“服务器当前时间 + 365 天”。
- 空间到期后永久清空作品文件和记录，保留已过期空间记录，不允许延长或恢复。
- 服务器必须验证期限、空间状态和空间所有权，不能只依赖页面限制。
- 不升级依赖，不提交环境变量、数据库、上传文件、凭证或生产备份。
- 只生成和提交迁移文件；未经用户单独批准，不应用生产迁移，不部署线上。
- 每个功能先写失败测试并确认失败，再做最小实现、确认通过后提交。

---

### Task 1: 增加统一的天数计算和空间截止时间字段

**Files:**
- Create: `server/src/retention.ts`
- Create: `server/src/retention.test.ts`
- Create: `server/prisma/migrations/20260730000000_add_space_expiration/migration.sql`
- Modify: `server/prisma/schema.prisma`

**Interfaces:**
- Produces: `addDays(date: Date, days: number): Date`
- Produces: `isExpired(expiresAt: Date, now?: Date): boolean`
- Produces: `ANONYMOUS_DAYS = 1`, `MAX_PERSONAL_DAYS = 30`, `MAX_SPACE_DAYS = 365`, `SPACE_EXTENSION_DAYS = 365`
- Produces: `Space.expiresAt: DateTime`

- [ ] **Step 1: Write the failing retention tests**

```ts
import { describe, expect, it } from "vitest";
import { addDays, isExpired } from "./retention";

describe("retention", () => {
  it("adds whole days without mutating the source date", () => {
    const source = new Date("2026-07-30T01:00:00.000Z");
    expect(addDays(source, 30).toISOString()).toBe("2026-08-29T01:00:00.000Z");
    expect(source.toISOString()).toBe("2026-07-30T01:00:00.000Z");
  });

  it("treats the exact cutoff as expired", () => {
    const cutoff = new Date("2026-07-31T01:00:00.000Z");
    expect(isExpired(cutoff, new Date("2026-07-31T01:00:00.000Z"))).toBe(true);
    expect(isExpired(cutoff, new Date("2026-07-31T00:59:59.999Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd server; npm.cmd test -- src/retention.test.ts`

Expected: FAIL because `./retention` does not exist.

- [ ] **Step 3: Add the minimal retention helper**

```ts
export const ANONYMOUS_DAYS = 1;
export const MAX_PERSONAL_DAYS = 30;
export const MAX_SPACE_DAYS = 365;
export const SPACE_EXTENSION_DAYS = 365;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
```

Add `expiresAt DateTime` and `@@index([expiresAt])` to `Space`.

Create migration SQL that:

```sql
ALTER TABLE `Space` ADD COLUMN `expiresAt` DATETIME(3) NULL;
UPDATE `Space` SET `expiresAt` = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 365 DAY);
ALTER TABLE `Space` MODIFY `expiresAt` DATETIME(3) NOT NULL;
CREATE INDEX `Space_expiresAt_idx` ON `Space`(`expiresAt`);
```

Do not run the migration against any production database.

- [ ] **Step 4: Generate the local Prisma client and verify GREEN**

Run: `cd server; npm.cmd run prisma:generate; npm.cmd test -- src/retention.test.ts`

Expected: Prisma generation succeeds and 2 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/src/retention.ts server/src/retention.test.ts server/prisma/schema.prisma server/prisma/migrations/20260730000000_add_space_expiration/migration.sql
git commit -m "Add space expiration model"
```

---

### Task 2: 强制执行匿名和登录个人上传期限

**Files:**
- Modify: `server/src/routes.deployments.ts`
- Modify: `server/src/routes.deployments.test.ts`

**Interfaces:**
- Consumes: `addDays`, `ANONYMOUS_DAYS`, `MAX_PERSONAL_DAYS`
- Changes authenticated upload payload from `durationHours` to `durationDays`
- Keeps `POST /api/deployments/anonymous` and `POST /api/deployments`

- [ ] **Step 1: Add failing HTTP tests**

Expand the Prisma mock with `deployment.create` and `space.findUnique`, and mock storage/random slug so multipart requests do not write real uploads.

Add tests equivalent to:

```ts
it("always gives anonymous uploads exactly one day", async () => {
  vi.setSystemTime(new Date("2026-07-30T01:00:00.000Z"));
  const response = await request(createApp())
    .post("/api/deployments/anonymous")
    .field("durationDays", "30")
    .attach("files", Buffer.from("<html></html>"), "index.html");

  expect(response.status).toBe(201);
  expect(prisma.deployment.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      expiresAt: new Date("2026-07-31T01:00:00.000Z"),
    }),
  }));
});

it.each(["0", "31", "1.5"])("rejects personal durationDays=%s", async (durationDays) => {
  const response = await request(createApp())
    .post("/api/deployments")
    .set("Authorization", "Bearer user-token")
    .field("durationDays", durationDays)
    .attach("files", Buffer.from("<html></html>"), "index.html");

  expect(response.status).toBe(400);
  expect(prisma.deployment.create).not.toHaveBeenCalled();
});

it.each(["1", "30"])("accepts personal durationDays=%s", async (durationDays) => {
  const response = await request(createApp())
    .post("/api/deployments")
    .set("Authorization", "Bearer user-token")
    .field("durationDays", durationDays)
    .attach("files", Buffer.from("<html></html>"), "index.html");

  expect(response.status).toBe(201);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd server; npm.cmd test -- src/routes.deployments.test.ts`

Expected: FAIL because anonymous still uses the configured hour default and authenticated uploads still accept hour-based values.

- [ ] **Step 3: Implement the minimal server validation**

Change the authenticated schema to:

```ts
const createSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  durationDays: z.coerce.number().int().min(1).max(MAX_PERSONAL_DAYS),
  spaceId: z.string().optional(),
});
```

For anonymous uploads:

```ts
const expiresAt = addDays(now, ANONYMOUS_DAYS);
```

For authenticated personal uploads:

```ts
const expiresAt = addDays(new Date(), payload.data.durationDays);
```

Keep the existing ownership check for `spaceId`; Task 3 will replace its expiration behavior with the authoritative space cutoff.

- [ ] **Step 4: Verify GREEN**

Run: `cd server; npm.cmd test -- src/routes.deployments.test.ts`

Expected: all personal deployment route tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/src/routes.deployments.ts server/src/routes.deployments.test.ts
git commit -m "Enforce personal upload retention days"
```

---

### Task 3: 让空间截止时间控制创建、上传、访问和延长

**Files:**
- Create: `server/src/routes.spaces.test.ts`
- Create: `server/src/deployment-access.ts`
- Create: `server/src/deployment-access.test.ts`
- Modify: `server/src/routes.spaces.ts`
- Modify: `server/src/routes.deployments.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `Space.expiresAt`, `addDays`, `isExpired`, `MAX_SPACE_DAYS`, `SPACE_EXTENSION_DAYS`
- Produces: `isDeploymentAvailable(deployment, now): boolean`
- Produces: `POST /api/spaces/:id/extend`
- `GET /api/spaces` returns `expiresAt` and `deploymentCount`
- `POST /api/spaces` consumes `durationDays`

- [ ] **Step 1: Write failing space route tests**

Create an Express/Supertest test app with mocked Prisma and authentication. Cover:

```ts
it.each(["0", "366", "1.5"])("rejects space durationDays=%s", async (durationDays) => {
  const response = await authed(request(createApp()).post("/api/spaces"))
    .send({ name: "作品空间", durationDays });
  expect(response.status).toBe(400);
});

it("creates a 365-day space", async () => {
  vi.setSystemTime(new Date("2026-07-30T01:00:00.000Z"));
  const response = await authed(request(createApp()).post("/api/spaces"))
    .send({ name: "作品空间", durationDays: 365 });
  expect(response.status).toBe(201);
  expect(prisma.space.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      expiresAt: new Date("2027-07-30T01:00:00.000Z"),
    }),
  }));
});

it("lists spaces with deployment counts and expiration", async () => {
  await authed(request(createApp()).get("/api/spaces"));
  expect(prisma.space.findMany).toHaveBeenCalledWith(expect.objectContaining({
    select: expect.objectContaining({
      expiresAt: true,
      _count: expect.any(Object),
    }),
  }));
});

it("refreshes an active owned space to now plus 365 days", async () => {
  vi.setSystemTime(new Date("2026-07-30T01:00:00.000Z"));
  vi.mocked(prisma.space.findUnique).mockResolvedValue({
    id: "s1",
    ownerUserId: "user-1",
    expiresAt: new Date("2026-08-01T01:00:00.000Z"),
  } as never);
  const response = await authed(request(createApp()).post("/api/spaces/s1/extend"));
  expect(response.status).toBe(200);
  expect(prisma.space.update).toHaveBeenCalledWith({
    where: { id: "s1" },
    data: { expiresAt: new Date("2027-07-30T01:00:00.000Z") },
  });
});

it("does not extend an expired space", async () => {
  vi.mocked(prisma.space.findUnique).mockResolvedValue({
    id: "s1",
    ownerUserId: "user-1",
    expiresAt: new Date("2020-01-01T00:00:00.000Z"),
  } as never);
  const response = await authed(request(createApp()).post("/api/spaces/s1/extend"));
  expect(response.status).toBe(410);
  expect(prisma.space.update).not.toHaveBeenCalled();
});
```

Also add multipart tests proving all three space upload paths reject an expired space and write `expiresAt: space.expiresAt` only as a compatibility value.

- [ ] **Step 2: Write failing deployment availability tests**

```ts
import { describe, expect, it } from "vitest";
import { isDeploymentAvailable } from "./deployment-access";

const now = new Date("2026-07-30T01:00:00.000Z");

it("uses personal expiration when no space exists", () => {
  expect(isDeploymentAvailable({
    deletedAt: null,
    visibility: "visible",
    expiresAt: new Date("2026-07-31T01:00:00.000Z"),
    space: null,
  }, now)).toBe(true);
});

it("uses only the parent space expiration for space work", () => {
  expect(isDeploymentAvailable({
    deletedAt: null,
    visibility: "visible",
    expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    space: { expiresAt: new Date("2026-07-31T01:00:00.000Z") },
  }, now)).toBe(true);
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `cd server; npm.cmd test -- src/routes.spaces.test.ts src/deployment-access.test.ts`

Expected: FAIL because the new route, field and access helper do not exist.

- [ ] **Step 4: Implement space-authoritative behavior**

Implement `isDeploymentAvailable` so deleted/hidden content is unavailable, personal content reads `deployment.expiresAt`, and space content reads only `deployment.space.expiresAt`.

In `index.ts`, load:

```ts
include: { space: { select: { expiresAt: true } } }
```

and replace the inline expiration condition with `isDeploymentAvailable(deployment)`.

In `routes.spaces.ts`:

- accept and validate `durationDays: 1..365`;
- set `Space.expiresAt = addDays(now, durationDays)`;
- return `expiresAt` and active deployment count from the list;
- reject expired spaces before detail, entry, single upload and batch upload;
- write each space deployment’s compatibility `expiresAt` from `space.expiresAt`;
- ignore any client-provided work duration;
- add `POST /:id/extend`, verify owner and active status, then update to `addDays(now, 365)`.

In the authenticated deployment route, when `spaceId` is present, use the fetched active owned space and its `expiresAt`; when absent, use `durationDays`.

- [ ] **Step 5: Verify GREEN and regression coverage**

Run: `cd server; npm.cmd test -- src/routes.spaces.test.ts src/deployment-access.test.ts src/routes.deployments.test.ts`

Expected: all focused route and access tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add server/src/routes.spaces.ts server/src/routes.spaces.test.ts server/src/routes.deployments.ts server/src/routes.deployments.test.ts server/src/deployment-access.ts server/src/deployment-access.test.ts server/src/index.ts
git commit -m "Make space expiration authoritative"
```

---

### Task 4: 到期空间永久清空作品但保留空间

**Files:**
- Create: `server/src/cleanup.test.ts`
- Modify: `server/src/cleanup.ts`

**Interfaces:**
- Produces: `cleanupExpiredContent(now?: Date): Promise<void>`
- Personal cleanup selects only `spaceId: null`
- Space cleanup selects `Space.expiresAt <= now` and removes child deployment folders/records without deleting `Space`

- [ ] **Step 1: Write failing cleanup tests**

Mock Prisma and storage. Add:

```ts
it("keeps space deployments out of personal expiration cleanup", async () => {
  await cleanupExpiredContent(now);
  expect(prisma.deployment.findMany).toHaveBeenCalledWith({
    where: {
      spaceId: null,
      deletedAt: null,
      expiresAt: { lte: now },
    },
  });
});

it("removes expired space files and records but keeps the space", async () => {
  vi.mocked(prisma.space.findMany).mockResolvedValue([{
    id: "s1",
    deployments: [
      { id: "d1", rootPath: "storage/spaces/s1/d1" },
      { id: "d2", rootPath: "storage/spaces/s1/d2" },
    ],
  }] as never);

  await cleanupExpiredContent(now);

  expect(removeDeploymentFolder).toHaveBeenCalledTimes(2);
  expect(prisma.deployment.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
  expect(prisma.deployment.delete).toHaveBeenCalledWith({ where: { id: "d2" } });
  expect(prisma.space.delete).not.toHaveBeenCalled();
});

it("does not delete a record when its folder removal fails", async () => {
  vi.mocked(removeDeploymentFolder).mockRejectedValueOnce(new Error("disk failure"));
  await cleanupExpiredContent(now);
  expect(prisma.deployment.delete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd server; npm.cmd test -- src/cleanup.test.ts`

Expected: FAIL because cleanup is not exported/testable and does not separate space expiration.

- [ ] **Step 3: Extract and implement cleanup**

Export `cleanupExpiredContent(now = new Date())`. Query personal expired deployments with `spaceId: null`. Query expired spaces with their non-deleted deployments:

```ts
await prisma.space.findMany({
  where: { expiresAt: { lte: now } },
  select: {
    id: true,
    deployments: {
      where: { deletedAt: null },
      select: { id: true, rootPath: true },
    },
  },
});
```

For each item, remove its folder first and then permanently delete its deployment record. Never delete or renew the parent space. Keep the cron schedule calling the exported function every ten minutes.

- [ ] **Step 4: Verify GREEN**

Run: `cd server; npm.cmd test -- src/cleanup.test.ts`

Expected: all cleanup tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/src/cleanup.ts server/src/cleanup.test.ts
git commit -m "Clear works from expired spaces"
```

---

### Task 5: 更新上传页、新建空间窗口和首页提示

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/pages/UploadPage.tsx`
- Modify: `web/src/pages/UploadPage.test.tsx`
- Modify: `web/src/components/CreateSpaceModal.tsx`
- Modify: `web/src/components/CreateSpaceModal.test.tsx`
- Modify: `web/src/pages/HomePage.tsx`
- Modify: `web/src/pages/HomePage.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- `Space` gains `expiresAt: string` and `deploymentCount: number`
- `CreateSpaceModal` posts `{ name, slug?, durationDays }`
- Upload page posts `durationDays` only for logged-in personal uploads

- [ ] **Step 1: Replace upload page tests with the required behavior**

Add assertions that:

```ts
expect(screen.getByText("匿名上传固定保留 1 天")).toBeInTheDocument();
expect(screen.queryByRole("spinbutton", { name: "链接保留时长" })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "匿名部署" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "登录/注册" })).toHaveAttribute("href", "/login");
```

For a logged-in user:

```ts
const duration = screen.getByRole("spinbutton", { name: "链接保留时长（天）" });
expect(duration).toHaveAttribute("min", "1");
expect(duration).toHaveAttribute("max", "30");
expect(screen.getByRole("button", { name: "部署" })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: "匿名部署" })).not.toBeInTheDocument();
```

Select a space, then select the personal option again:

```ts
const target = screen.getByRole("combobox", { name: "上传到空间" });
await user.selectOptions(target, "s1");
expect(screen.getByText(/空间内作品跟随空间到期/)).toBeInTheDocument();
expect(screen.queryByRole("spinbutton", { name: "链接保留时长（天）" })).not.toBeInTheDocument();
await user.selectOptions(target, "");
expect(target).toHaveValue("");
expect(screen.getByRole("spinbutton", { name: "链接保留时长（天）" })).toBeInTheDocument();
```

Verify personal form data contains `durationDays`, while space uploads contain `spaceId` and omit `durationDays`.

- [ ] **Step 2: Add failing modal and homepage copy tests**

Modal tests require a “空间有效期（天）” spinbutton with min 1/max 365 and verify `durationDays` is posted.

Homepage test requires the exact retention copy:

```text
匿名上传保留 1 天；登录后个人上传可选择 1–30 天；空间可设置 1–365 天，空间内作品跟随空间到期。
```

- [ ] **Step 3: Run focused frontend tests and verify RED**

Run: `cd web; npm.cmd test -- src/pages/UploadPage.test.tsx src/components/CreateSpaceModal.test.tsx src/pages/HomePage.test.tsx`

Expected: FAIL on the old hour controls, hidden personal option, old buttons and missing space duration.

- [ ] **Step 4: Implement the minimal UI behavior**

- Replace `durationHours` state with `durationDays`, defaulting to 1.
- Render a fixed anonymous note instead of an input.
- For logged-in personal upload, render 1–30 day input.
- Make `<option value="">仅个人上传（不加入空间）</option>` visible.
- When a space is selected, hide personal duration and display its formatted expiration.
- Render anonymous “匿名部署” plus a `/login` link; render only “部署” for signed-in users.
- Send `durationDays` only for signed-in personal uploads.
- Add modal `durationDays` state and 1–365 validation.
- Update the homepage retention sentence.
- Use existing colors and typography; only add spacing/status styles required by the new controls.

- [ ] **Step 5: Verify GREEN**

Run: `cd web; npm.cmd test -- src/pages/UploadPage.test.tsx src/components/CreateSpaceModal.test.tsx src/pages/HomePage.test.tsx`

Expected: all focused frontend tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add web/src/types.ts web/src/pages/UploadPage.tsx web/src/pages/UploadPage.test.tsx web/src/components/CreateSpaceModal.tsx web/src/components/CreateSpaceModal.test.tsx web/src/pages/HomePage.tsx web/src/pages/HomePage.test.tsx web/src/styles.css
git commit -m "Update upload retention controls"
```

---

### Task 6: 将个人控制台空间管理改为可延长的表格

**Files:**
- Modify: `web/src/pages/DashboardPage.tsx`
- Modify: `web/src/pages/DashboardPage.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `Space.expiresAt`, `Space.deploymentCount`
- Calls: `POST /spaces/:id/extend`

- [ ] **Step 1: Write failing dashboard table tests**

Mock one active and one expired space. After opening “空间管理”, assert column headers:

```ts
["空间名称", "网址后缀", "作品数量", "到期时间", "状态", "操作"]
```

Assert the active row shows its count, “有效”, links and “延长一年”; the expired row shows count 0, “已过期”, and has no extension button or usable entry link.

Click the active row’s extension button and assert:

```ts
expect(api.post).toHaveBeenCalledWith("/spaces/s1/extend");
```

Then mock the returned `expiresAt` and assert the row refreshes to the returned value.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd web; npm.cmd test -- src/pages/DashboardPage.test.tsx`

Expected: FAIL because spaces are still rendered as a list and no extension action exists.

- [ ] **Step 3: Implement the table and extension action**

- Add a `getSpaceStatus(space, now)` helper returning “有效” or “已过期”.
- Render the six columns using the existing `admin-table` styles.
- Keep “新建空间” above the table.
- For active rows, render management link, entry link and extension button.
- For expired rows, render status only and no extension/entry actions.
- `extendSpace(id)` posts to `/spaces/${id}/extend`, replaces that row with the returned space and displays a clear success/error message.

- [ ] **Step 4: Verify GREEN**

Run: `cd web; npm.cmd test -- src/pages/DashboardPage.test.tsx`

Expected: all dashboard tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/src/pages/DashboardPage.tsx web/src/pages/DashboardPage.test.tsx web/src/styles.css
git commit -m "Show expiring spaces in dashboard table"
```

---

### Task 7: 更新空间页面和管理后台，移除作品独立期限表达

**Files:**
- Modify: `web/src/pages/SpaceEntryPage.tsx`
- Modify: `web/src/pages/SpaceEntryPage.test.tsx`
- Modify: `web/src/pages/SpacePage.tsx`
- Create: `web/src/pages/SpacePage.test.tsx`
- Modify: `web/src/pages/AdminPage.tsx`
- Modify: `web/src/pages/AdminPage.test.tsx`
- Modify: `web/src/types.ts`

**Interfaces:**
- Space detail and entry responses include `expiresAt`
- Space works no longer display their compatibility `Deployment.expiresAt` as an independent deadline

- [ ] **Step 1: Write failing page tests**

Update space entry fixtures to include `space.expiresAt` and require the page to say “空间内作品统一于 … 到期”.

Create `SpacePage.test.tsx` that loads an active space and asserts the space deadline appears once while the works table has no “到期” column.

Update admin tests so the space list/detail displays the space deadline, and space deployment rows do not imply separate deadlines.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd web; npm.cmd test -- src/pages/SpaceEntryPage.test.tsx src/pages/SpacePage.test.tsx src/pages/AdminPage.test.tsx`

Expected: FAIL because space expiry is not displayed and project-level expiry remains visible.

- [ ] **Step 3: Implement the copy and table changes**

- Include `expiresAt` in space response types.
- Show one authoritative deadline in space entry and management headers.
- Remove the per-project expiration column from the space management table.
- Add the space deadline to admin space list/detail while keeping personal deployment deadlines unchanged.
- Do not change the existing visibility, deletion, ZIP download or permission controls.

- [ ] **Step 4: Verify GREEN**

Run: `cd web; npm.cmd test -- src/pages/SpaceEntryPage.test.tsx src/pages/SpacePage.test.tsx src/pages/AdminPage.test.tsx`

Expected: all focused page tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/src/pages/SpaceEntryPage.tsx web/src/pages/SpaceEntryPage.test.tsx web/src/pages/SpacePage.tsx web/src/pages/SpacePage.test.tsx web/src/pages/AdminPage.tsx web/src/pages/AdminPage.test.tsx web/src/types.ts
git commit -m "Show authoritative space deadlines"
```

---

### Task 8: 全量验证和实施记录

**Files:**
- Modify only if a failing check reveals a requirement-related defect.

**Interfaces:**
- Verifies all preceding tasks together.

- [ ] **Step 1: Run all server tests**

Run: `cd server; npm.cmd test`

Expected: all server test files PASS with 0 failed tests.

- [ ] **Step 2: Run server build**

Run: `cd server; npm.cmd run build`

Expected: TypeScript build exits 0.

- [ ] **Step 3: Run all frontend tests**

Run: `cd web; npm.cmd test`

Expected: all frontend test files PASS with 0 failed tests.

- [ ] **Step 4: Run frontend typecheck and build**

Run: `cd web; npm.cmd run typecheck; npm.cmd run build`

Expected: both commands exit 0 and Vite produces `web/dist`.

- [ ] **Step 5: Inspect scope and migration safety**

Run:

```powershell
git status --short
git diff --check HEAD~7..HEAD
git log -8 --oneline
```

Expected:

- no `.env`, database, uploaded file, credential or backup is tracked;
- the migration contains only `Space.expiresAt`, the existing-space backfill and its index;
- no production migration or deployment command has been run;
- every implementation task has its own commit.

- [ ] **Step 6: Report completion without deploying**

Report exact test/build counts, migration path, commit list, and explicitly state that production remains unchanged. Ask for separate approval before merging/pushing/deploying or applying the production migration.
