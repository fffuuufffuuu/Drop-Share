# Space Admin Controls and Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-verified administrator work controls, uploader information, clearer space-page layout, and owner-confirmed permanent space deletion.

**Architecture:** Keep the public space-entry response limited to visible works. Add a dedicated administrator visibility endpoint behind the existing administrator middleware, add an owner-only space deletion endpoint, and enrich the existing owned-space detail response with a safe uploader label. The React pages only decide which controls to render; every state-changing request is re-authorized by the server.

**Tech Stack:** Express 5, Prisma 6, Vitest, Supertest, React 19, React Router 7, Testing Library, TypeScript, CSS.

## Global Constraints

- Work only in the isolated local worktree; do not edit the live directory directly.
- Use test-driven development: write and run a failing test before every implementation.
- Keep the public space-entry endpoint limited to visible works, including for administrators.
- Administrator visibility and permanent work deletion must use administrator-only server routes.
- Space deletion must verify ownership on the server and permanently remove all works and files.
- Do not add dependencies, database fields, or database migrations.
- Do not deploy or change production while executing this plan unless the user separately authorizes deployment.
- Do not commit `.env`, database files, uploads, backups, or credentials.
- Verify backend work from `server` with `npm.cmd test` and `npm.cmd run build`.
- Verify frontend work from `web` with `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run build`.

---

## File Map

- `server/src/routes.admin.ts`: add the administrator-only visibility update route.
- `server/src/routes.admin.test.ts`: prove administrator visibility updates and invalid/not-found handling.
- `server/src/routes.spaces.ts`: return uploader labels from owned-space detail and add owner-only permanent space deletion.
- `server/src/routes.spaces.test.ts`: prove uploader mapping, owner authorization, expired-space deletion, and rejection of other users.
- `web/src/pages/SpaceEntryPage.tsx`: center-oriented markup stays intact; render administrator icon controls and call administrator routes.
- `web/src/pages/SpaceEntryPage.test.tsx`: prove role-based controls, confirmation, and removal after hide/delete.
- `web/src/components/CreateSpaceModal.tsx`: mark the suffix tooltip as right-positioned.
- `web/src/components/CreateSpaceModal.test.tsx`: prove the tooltip uses the right-position class.
- `web/src/pages/SpacePage.tsx`: add uploader column and a spaced action group.
- `web/src/pages/SpacePage.test.tsx`: prove uploader labels and action grouping.
- `web/src/pages/DashboardPage.tsx`: add confirmed space deletion for active and expired spaces.
- `web/src/pages/DashboardPage.test.tsx`: prove cancel, server call, and removal from the table.
- `web/src/types.ts`: add the uploader label to space deployment data without changing personal deployment data.
- `web/src/styles.css`: center the space heading, position tooltip to the right, and style icon/action spacing.

---

### Task 1: Administrator Visibility Endpoint

**Files:**
- Modify: `server/src/routes.admin.test.ts`
- Modify: `server/src/routes.admin.ts`

**Interfaces:**
- Consumes: existing `adminRouter.use(requireAuth, requireAdmin)` and Prisma `Visibility`.
- Produces: `PATCH /api/admin/deployments/:id` with body `{ visibility: "visible" | "hidden" }`.
- Returns: the updated deployment on success, `400` for an invalid value, and `404` when the deployment does not exist.

- [ ] **Step 1: Write the failing route tests**

Add `findUnique` and `update` to the mocked deployment client:

```ts
deployment: {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
},
```

Enable JSON request bodies in `createApp()`:

```ts
function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ message: error.message });
  });
  return app;
}
```

Add these tests before the download tests:

```ts
it("updates deployment visibility through the admin route", async () => {
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1" } as never);
  vi.mocked(prisma.deployment.update).mockResolvedValue({
    id: "d1",
    visibility: "hidden",
  } as never);

  const response = await request(createApp())
    .patch("/api/admin/deployments/d1")
    .send({ visibility: "hidden" });

  expect(response.status).toBe(200);
  expect(prisma.deployment.update).toHaveBeenCalledWith({
    where: { id: "d1" },
    data: { visibility: "hidden" },
  });
  expect(response.body).toMatchObject({ id: "d1", visibility: "hidden" });
});

it("rejects an invalid administrator visibility value", async () => {
  const response = await request(createApp())
    .patch("/api/admin/deployments/d1")
    .send({ visibility: "archived" });

  expect(response.status).toBe(400);
  expect(prisma.deployment.update).not.toHaveBeenCalled();
});

it("returns 404 when an administrator changes a missing deployment", async () => {
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue(null);

  const response = await request(createApp())
    .patch("/api/admin/deployments/missing")
    .send({ visibility: "hidden" });

  expect(response.status).toBe(404);
  expect(prisma.deployment.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
cd server
npm.cmd test -- src/routes.admin.test.ts
```

Expected: FAIL because `PATCH /api/admin/deployments/:id` returns `404`.

- [ ] **Step 3: Add the minimal administrator route**

Update imports:

```ts
import { Visibility } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
```

Add this route after the personal-deployment inventory route:

```ts
adminRouter.patch("/deployments/:id", async (req, res) => {
  const parsed = z.object({
    visibility: z.enum([Visibility.visible, Visibility.hidden]),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "无效的可见状态" });
    return;
  }

  const deployment = await prisma.deployment.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true },
  });
  if (!deployment) {
    res.status(404).json({ message: "网页不存在或已被删除" });
    return;
  }

  const updated = await prisma.deployment.update({
    where: { id: deployment.id },
    data: { visibility: parsed.data.visibility },
  });
  res.json(updated);
});
```

No extra role check belongs inside this handler because the router-wide `requireAuth, requireAdmin` middleware already reloads and verifies the role from the database.

- [ ] **Step 4: Run the focused tests and confirm success**

Run:

```powershell
cd server
npm.cmd test -- src/routes.admin.test.ts
```

Expected: all tests in `routes.admin.test.ts` PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add server/src/routes.admin.ts server/src/routes.admin.test.ts
git commit -m "feat: add admin visibility control"
```

---

### Task 2: Owned-Space Uploader Data and Permanent Space Deletion

**Files:**
- Modify: `server/src/routes.spaces.test.ts`
- Modify: `server/src/routes.spaces.ts`

**Interfaces:**
- Consumes: `permanentlyDeleteSpace(id)` from `server/src/admin-deletion.ts`.
- Produces: owned-space deployment objects with `uploaderName: string`.
- Produces: `DELETE /api/spaces/:id`, available to the authenticated owner for active or expired spaces.
- Returns: `{ message: "空间已永久删除" }` on success and `404` when missing or owned by someone else.

- [ ] **Step 1: Write failing server tests**

Mock the deletion helper:

```ts
import { permanentlyDeleteSpace } from "./admin-deletion";

vi.mock("./admin-deletion", () => ({
  permanentlyDeleteSpace: vi.fn(),
}));
```

Add a detail-response test:

```ts
it("returns uploader labels in an owned space detail", async () => {
  vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
  vi.mocked(prisma.deployment.findMany).mockResolvedValue([
    {
      id: "d1",
      title: "登录作品",
      publicSlug: "signed-work",
      visibility: "visible",
      createdAt: now,
      expiresAt: activeSpace.expiresAt,
      owner: { username: "member" },
    },
    {
      id: "d2",
      title: "匿名作品",
      publicSlug: "anonymous-work",
      visibility: "hidden",
      createdAt: now,
      expiresAt: activeSpace.expiresAt,
      owner: null,
    },
  ] as never);

  const response = await authed(request(createApp()).get("/api/spaces/s1"));

  expect(response.status).toBe(200);
  expect(prisma.deployment.findMany).toHaveBeenCalledWith({
    where: { spaceId: "s1", deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { username: true } } },
  });
  expect(response.body.deployments).toEqual([
    expect.objectContaining({ id: "d1", uploaderName: "member" }),
    expect.objectContaining({ id: "d2", uploaderName: "匿名" }),
  ]);
});
```

Add deletion tests:

```ts
it("permanently deletes an owned active space", async () => {
  vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
  vi.mocked(permanentlyDeleteSpace).mockResolvedValue("deleted");

  const response = await authed(request(createApp()).delete("/api/spaces/s1"));

  expect(response.status).toBe(200);
  expect(permanentlyDeleteSpace).toHaveBeenCalledWith("s1");
  expect(response.body).toEqual({ message: "空间已永久删除" });
});

it("allows an owner to permanently delete an expired space", async () => {
  vi.mocked(prisma.space.findUnique).mockResolvedValue({
    ...activeSpace,
    expiresAt: new Date("2020-01-01T00:00:00.000Z"),
  } as never);
  vi.mocked(permanentlyDeleteSpace).mockResolvedValue("deleted");

  const response = await authed(request(createApp()).delete("/api/spaces/s1"));

  expect(response.status).toBe(200);
  expect(permanentlyDeleteSpace).toHaveBeenCalledWith("s1");
});

it("does not delete another user's space", async () => {
  vi.mocked(prisma.space.findUnique).mockResolvedValue({
    ...activeSpace,
    ownerUserId: "user-2",
  } as never);

  const response = await authed(request(createApp()).delete("/api/spaces/s1"));

  expect(response.status).toBe(404);
  expect(permanentlyDeleteSpace).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
cd server
npm.cmd test -- src/routes.spaces.test.ts
```

Expected: FAIL because owned-space detail lacks `uploaderName` and the delete route does not exist.

- [ ] **Step 3: Enrich the owned-space detail response**

Import the deletion helper:

```ts
import { permanentlyDeleteSpace } from "./admin-deletion";
```

Change the owned-space deployment query and response:

```ts
const deployments = await prisma.deployment.findMany({
  where: { spaceId: space.id, deletedAt: null },
  orderBy: { createdAt: "desc" },
  include: {
    owner: {
      select: { username: true },
    },
  },
});

res.json({
  ...space,
  deployments: deployments.map(({ owner, ...deployment }) => ({
    ...deployment,
    uploaderName: owner?.username ?? "匿名",
  })),
});
```

This removes the nested owner object from the response and exposes only the safe display name.

- [ ] **Step 4: Add the owner-only delete route**

Add after `POST /:id/extend`:

```ts
spaceRouter.delete("/:id", requireAuth, async (req, res, next) => {
  const space = await prisma.space.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!space || space.ownerUserId !== req.authUser?.userId) {
    res.status(404).json({ message: "空间不存在或无权删除" });
    return;
  }

  try {
    const result = await permanentlyDeleteSpace(space.id);
    if (result === "not-found") {
      res.status(404).json({ message: "空间不存在或已被删除" });
      return;
    }
    res.json({ message: "空间已永久删除" });
  } catch (error) {
    next(error);
  }
});
```

Do not add an expiration check: owners may delete both active and expired space records.

- [ ] **Step 5: Run the focused server tests and build**

Run:

```powershell
cd server
npm.cmd test -- src/routes.spaces.test.ts
npm.cmd run build
```

Expected: the focused tests PASS and TypeScript build exits with code `0`.

- [ ] **Step 6: Commit Task 2**

```powershell
git add server/src/routes.spaces.ts server/src/routes.spaces.test.ts
git commit -m "feat: add owned space deletion"
```

---

### Task 3: Space-Entry Administrator Controls and Tooltip Placement

**Files:**
- Modify: `web/src/pages/SpaceEntryPage.test.tsx`
- Modify: `web/src/components/CreateSpaceModal.test.tsx`
- Modify: `web/src/pages/SpaceEntryPage.tsx`
- Modify: `web/src/components/CreateSpaceModal.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `getCurrentUser(): CurrentUser | null` from `web/src/auth.ts`.
- Consumes: `PATCH /api/admin/deployments/:id` and existing `DELETE /api/admin/deployments/:id`.
- Produces: administrator-only card actions with accessible labels `隐藏<作品名>` and `删除<作品名>`.
- Produces: `.field-help-tooltip-right` for desktop-right tooltip placement.

- [ ] **Step 1: Write failing space-entry tests**

Add `within` to the Testing Library import and add:

```ts
it("shows administrator hide and delete controls but not the owner close control", async () => {
  localStorage.setItem("token", "admin-token");
  localStorage.setItem("user", JSON.stringify({
    id: "admin-1",
    username: "fffuuu",
    role: "ADMIN",
  }));
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
        ownerUserId: "admin-1",
        uploaderName: "fffuuu",
      }],
    },
  });

  renderSpaceEntry();

  const card = (await screen.findByRole("heading", { name: "我的作品" }))
    .closest("article")!;
  expect(within(card).getByRole("link", { name: "打开我的作品" })).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "隐藏我的作品" })).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "删除我的作品" })).toBeInTheDocument();
  expect(within(card).queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
});

it("removes a hidden work from the administrator space entry", async () => {
  localStorage.setItem("token", "admin-token");
  localStorage.setItem("user", JSON.stringify({
    id: "admin-1",
    username: "fffuuu",
    role: "ADMIN",
  }));
  vi.spyOn(api, "get").mockResolvedValue({
    data: {
      space: {
        id: "space-1",
        name: "作品空间",
        slug: "demo",
        expiresAt: "2027-07-30T01:00:00.000Z",
      },
      deployments: [{
        id: "d1",
        title: "待隐藏作品",
        publicSlug: "work",
        ownerUserId: null,
        uploaderName: "匿名",
      }],
    },
  });
  vi.spyOn(api, "patch").mockResolvedValue({ data: { id: "d1", visibility: "hidden" } });
  const user = userEvent.setup();

  renderSpaceEntry();
  await user.click(await screen.findByRole("button", { name: "隐藏待隐藏作品" }));

  expect(api.patch).toHaveBeenCalledWith(
    "/admin/deployments/d1",
    { visibility: "hidden" },
  );
  expect(screen.queryByRole("heading", { name: "待隐藏作品" })).not.toBeInTheDocument();
});

it("confirms before permanently deleting a work as administrator", async () => {
  localStorage.setItem("token", "admin-token");
  localStorage.setItem("user", JSON.stringify({
    id: "admin-1",
    username: "fffuuu",
    role: "ADMIN",
  }));
  vi.spyOn(api, "get").mockResolvedValue({
    data: {
      space: {
        id: "space-1",
        name: "作品空间",
        slug: "demo",
        expiresAt: "2027-07-30T01:00:00.000Z",
      },
      deployments: [{
        id: "d1",
        title: "待删除作品",
        publicSlug: "work",
        ownerUserId: null,
        uploaderName: "匿名",
      }],
    },
  });
  vi.spyOn(api, "delete").mockResolvedValue({ data: { message: "网页已永久删除" } });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();

  renderSpaceEntry();
  await user.click(await screen.findByRole("button", { name: "删除待删除作品" }));

  expect(window.confirm).toHaveBeenCalledWith(
    "此操作将永久删除该作品，无法恢复。确定继续吗？",
  );
  expect(api.delete).toHaveBeenCalledWith("/admin/deployments/d1");
  expect(screen.queryByRole("heading", { name: "待删除作品" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing tooltip-direction test**

In `CreateSpaceModal.test.tsx`, extend the existing tooltip test:

```ts
const tooltip = screen.getByRole("tooltip");
expect(tooltip).toHaveClass("field-help-tooltip-right");
```

- [ ] **Step 3: Run the focused frontend tests and confirm failure**

Run:

```powershell
cd web
npm.cmd test -- src/pages/SpaceEntryPage.test.tsx src/components/CreateSpaceModal.test.tsx
```

Expected: FAIL because administrator controls and the tooltip-right class do not exist.

- [ ] **Step 4: Implement the administrator actions**

Replace the local user parser with:

```ts
import { getCurrentUser } from "../auth";
```

Remove the local `getCurrentUser` function. Add:

```ts
async function hideAsAdmin(deploymentId: string) {
  try {
    await api.patch(`/admin/deployments/${deploymentId}`, { visibility: "hidden" });
    setData((current) => current ? {
      ...current,
      deployments: current.deployments.filter((item) => item.id !== deploymentId),
    } : current);
    setMessage("作品已隐藏，可在空间项目管理中恢复");
  } catch (error: any) {
    setMessage(error.response?.data?.message || "隐藏作品失败");
  }
}

async function deleteAsAdmin(deploymentId: string) {
  if (!confirm("此操作将永久删除该作品，无法恢复。确定继续吗？")) return;
  try {
    await api.delete(`/admin/deployments/${deploymentId}`);
    setData((current) => current ? {
      ...current,
      deployments: current.deployments.filter((item) => item.id !== deploymentId),
    } : current);
    setMessage("作品已永久删除");
  } catch (error: any) {
    setMessage(error.response?.data?.message || "删除作品失败");
  }
}
```

Use this actions branch in each card:

```tsx
actions={
  currentUser?.role === "ADMIN" ? (
    <div className="work-admin-actions">
      <button
        type="button"
        className="work-icon-action"
        aria-label={`隐藏${deployment.title}`}
        title="隐藏作品"
        onClick={() => void hideAsAdmin(deployment.id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.9 10.9 0 0112 4c5.5 0 9 5.5 9 5.5a14.4 14.4 0 01-2.1 2.7M6.2 6.2C3.9 7.7 3 9.5 3 9.5S6.5 15 12 15c1 0 2-.2 2.8-.5" />
        </svg>
      </button>
      <button
        type="button"
        className="work-icon-action work-icon-action-danger"
        aria-label={`删除${deployment.title}`}
        title="永久删除作品"
        onClick={() => void deleteAsAdmin(deployment.id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13M10 11v5m4-5v5" />
        </svg>
      </button>
    </div>
  ) : currentUser && deployment.ownerUserId === currentUser.id ? (
    <button
      type="button"
      className="btn-close"
      onClick={() => closeDeployment(deployment.id)}
    >
      关闭
    </button>
  ) : undefined
}
```

- [ ] **Step 5: Add the tooltip class and visual styles**

Change the tooltip class:

```tsx
className={`field-help-tooltip field-help-tooltip-right${
  slugHelpVisible ? " is-visible" : ""
}`}
```

Update/add CSS:

```css
.space-entry-hero {
  text-align: center;
}

.field-help-tooltip-right {
  top: 50%;
  bottom: auto;
  left: calc(100% + 10px);
  transform: translate(-4px, -50%);
}

.field-help-tooltip-right.is-visible {
  transform: translate(0, -50%);
}

.work-admin-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}

.work-icon-action {
  display: inline-grid;
  width: 34px;
  height: 34px;
  padding: 0;
  place-items: center;
  border: 1px solid #d8dee9;
  border-radius: 9px;
  background: #f7f8fa;
  color: #7b8798;
}

.work-icon-action svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.work-icon-action:hover,
.work-icon-action:focus-visible {
  border-color: #9aa8bb;
  background: #eef1f5;
  color: #344054;
}

.work-icon-action-danger:hover,
.work-icon-action-danger:focus-visible {
  border-color: #f0b4b4;
  background: #fff1f1;
  color: #c52b2b;
}

@media (max-width: 640px) {
  .field-help-tooltip-right {
    top: calc(100% + 10px);
    right: 0;
    left: auto;
    transform: translateY(-4px);
  }

  .field-help-tooltip-right.is-visible {
    transform: translateY(0);
  }
}
```

Retain the existing space-entry colors and typography; this task changes hierarchy and controls, not the established visual identity.

- [ ] **Step 6: Run focused tests, typecheck, and commit**

Run:

```powershell
cd web
npm.cmd test -- src/pages/SpaceEntryPage.test.tsx src/components/CreateSpaceModal.test.tsx
npm.cmd run typecheck
```

Expected: focused tests PASS and typecheck exits with code `0`.

Commit:

```powershell
git add web/src/pages/SpaceEntryPage.tsx web/src/pages/SpaceEntryPage.test.tsx web/src/components/CreateSpaceModal.tsx web/src/components/CreateSpaceModal.test.tsx web/src/styles.css
git commit -m "feat: add admin controls to space entry"
```

---

### Task 4: Space Project Uploader Column and Action Spacing

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/pages/SpacePage.test.tsx`
- Modify: `web/src/pages/SpacePage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: owned-space detail objects with `uploaderName`.
- Produces: `SpaceDeployment = Deployment & { uploaderName: string }`.
- Produces: `.space-deployment-actions` around the visibility and delete controls.

- [ ] **Step 1: Write the failing table test**

Change the deployment fixture to include:

```ts
uploaderName: "member",
```

Add assertions:

```ts
expect(screen.getByRole("columnheader", { name: "上传者" })).toBeInTheDocument();
expect(screen.getByText("member")).toBeInTheDocument();
const actions = screen.getByRole("button", { name: "显示/隐藏" }).parentElement;
expect(actions).toHaveClass("space-deployment-actions");
```

Add a second fixture with `uploaderName: "匿名"` and assert the table displays `匿名`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```powershell
cd web
npm.cmd test -- src/pages/SpacePage.test.tsx
```

Expected: FAIL because there is no uploader column or action wrapper.

- [ ] **Step 3: Add the response type and table column**

In `web/src/types.ts` add:

```ts
export type SpaceDeployment = Deployment & {
  uploaderName: string;
};
```

Use it in `SpacePage.tsx`:

```ts
import type { SpaceDeployment } from "../types";

type SpaceDetail = {
  id: string;
  name: string;
  slug: string;
  expiresAt: string;
  deployments: SpaceDeployment[];
};
```

Change the table:

```tsx
<thead>
  <tr>
    <th>项目</th>
    <th>上传者</th>
    <th>可见性</th>
    <th>操作</th>
  </tr>
</thead>
```

Add the uploader cell and wrap the existing buttons:

```tsx
<td>{deployment.uploaderName}</td>
<td>{deployment.visibility === "visible" ? "显示" : "隐藏"}</td>
<td>
  <div className="space-deployment-actions">
    <button
      type="button"
      onClick={() =>
        toggleVisibility(
          deployment.id,
          deployment.visibility === "visible" ? "hidden" : "visible",
        )
      }
    >
      显示/隐藏
    </button>
    <button type="button" onClick={() => removeDeployment(deployment.id)}>
      删除
    </button>
  </div>
</td>
```

- [ ] **Step 4: Add action spacing**

Add:

```css
.space-deployment-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
cd web
npm.cmd test -- src/pages/SpacePage.test.tsx
npm.cmd run typecheck
```

Expected: focused tests PASS and typecheck exits with code `0`.

Commit:

```powershell
git add web/src/types.ts web/src/pages/SpacePage.tsx web/src/pages/SpacePage.test.tsx web/src/styles.css
git commit -m "feat: show uploaders in space management"
```

---

### Task 5: Confirmed Space Deletion in Personal Dashboard

**Files:**
- Modify: `web/src/pages/DashboardPage.test.tsx`
- Modify: `web/src/pages/DashboardPage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `DELETE /api/spaces/:id`.
- Produces: a delete button for every owned active or expired space.
- Confirmation copy: `此操作将永久删除该空间及其中全部作品，无法恢复。确定继续吗？`.

- [ ] **Step 1: Write the failing dashboard test**

Add `delete` to the API mock:

```ts
api: {
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
},
```

Add:

```ts
it("confirms and permanently deletes active or expired spaces", async () => {
  const spaces = [
    {
      id: "s1",
      name: "作品空间",
      slug: "portfolio",
      createdAt: "2026-07-29T01:00:00.000Z",
      expiresAt: "2099-07-30T01:00:00.000Z",
      deploymentCount: 4,
    },
    {
      id: "s2",
      name: "过期空间",
      slug: "expired",
      createdAt: "2026-07-29T01:00:00.000Z",
      expiresAt: "2020-01-01T00:00:00.000Z",
      deploymentCount: 0,
    },
  ];
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === "/deployments") return { data: [] };
    if (url === "/spaces") return { data: spaces };
    throw new Error(`unexpected GET ${url}`);
  });
  vi.mocked(api.delete).mockResolvedValue({
    data: { message: "空间已永久删除" },
  });
  vi.spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  const user = userEvent.setup();

  renderPage();
  await user.click(screen.getByRole("button", { name: "空间管理" }));

  const activeRow = (await screen.findByText("作品空间")).closest("tr")!;
  const expiredRow = screen.getByText("过期空间").closest("tr")!;
  expect(within(activeRow).getByRole("button", { name: "删除作品空间" }))
    .toBeInTheDocument();
  expect(within(expiredRow).getByRole("button", { name: "删除过期空间" }))
    .toBeInTheDocument();

  await user.click(within(activeRow).getByRole("button", { name: "删除作品空间" }));
  expect(api.delete).not.toHaveBeenCalled();

  await user.click(within(expiredRow).getByRole("button", { name: "删除过期空间" }));
  expect(window.confirm).toHaveBeenLastCalledWith(
    "此操作将永久删除该空间及其中全部作品，无法恢复。确定继续吗？",
  );
  expect(api.delete).toHaveBeenCalledWith("/spaces/s2");
  await waitFor(() => {
    expect(screen.queryByText("过期空间")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```powershell
cd web
npm.cmd test -- src/pages/DashboardPage.test.tsx
```

Expected: FAIL because space delete buttons do not exist.

- [ ] **Step 3: Add dashboard deletion behavior**

Add:

```ts
async function deleteSpace(space: Space) {
  if (!confirm("此操作将永久删除该空间及其中全部作品，无法恢复。确定继续吗？")) {
    return;
  }
  try {
    await api.delete(`/spaces/${space.id}`);
    setSpaces((current) => current.filter((item) => item.id !== space.id));
    setMessage("空间及其中全部作品已永久删除");
  } catch (error: any) {
    setMessage(error.response?.data?.message || "删除空间失败");
  }
}
```

Always render the action wrapper. Keep active-only links and extension inside it, then add the delete button outside that condition:

```tsx
<td>
  <div className="dashboard-space-actions">
    {status === "有效" && (
      <>
        <Link to={`/spaces/${space.id}`}>进入管理</Link>
        <Link to={`/s/${space.slug}`}>入口页面</Link>
        <button
          type="button"
          onClick={() => void extendSpace(space.id)}
        >
          延长一年
        </button>
      </>
    )}
    <button
      type="button"
      className="dashboard-delete-space"
      aria-label={`删除${space.name}`}
      onClick={() => void deleteSpace(space)}
    >
      删除空间
    </button>
  </div>
</td>
```

- [ ] **Step 4: Style the destructive action without overpowering routine actions**

Add:

```css
.dashboard-delete-space {
  border-color: #e6caca;
  background: #fffafa;
  color: #a12a2a;
}

.dashboard-delete-space:hover,
.dashboard-delete-space:focus-visible {
  border-color: #d98d8d;
  background: #fff0f0;
  color: #861d1d;
}
```

- [ ] **Step 5: Run focused tests, typecheck, and commit**

Run:

```powershell
cd web
npm.cmd test -- src/pages/DashboardPage.test.tsx
npm.cmd run typecheck
```

Expected: focused tests PASS and typecheck exits with code `0`.

Commit:

```powershell
git add web/src/pages/DashboardPage.tsx web/src/pages/DashboardPage.test.tsx web/src/styles.css
git commit -m "feat: add permanent space deletion"
```

---

### Task 6: Full Verification and Visual Review

**Files:**
- Modify only files required to fix failures directly caused by Tasks 1–5.
- Do not add features during this task.

**Interfaces:**
- Consumes: all completed server and frontend behavior.
- Produces: a clean branch with full automated and desktop visual verification evidence.

- [ ] **Step 1: Run all server tests**

```powershell
cd server
npm.cmd test
```

Expected: every server test PASS with zero failures.

- [ ] **Step 2: Build the server**

```powershell
cd server
npm.cmd run build
```

Expected: TypeScript exits with code `0`.

- [ ] **Step 3: Run all frontend tests**

```powershell
cd web
npm.cmd test
```

Expected: every frontend test PASS with zero failures.

- [ ] **Step 4: Type-check and build the frontend**

```powershell
cd web
npm.cmd run typecheck
npm.cmd run build
```

Expected: both commands exit with code `0`, and Vite creates `web/dist`.

- [ ] **Step 5: Review the four affected screens at desktop width**

Start the local services in separate PowerShell terminals:

```powershell
cd server
npm.cmd run dev
```

```powershell
cd web
npm.cmd run dev -- --host 127.0.0.1
```

Open the Vite URL printed by the second command and verify:

1. Space-entry title is centered.
2. An administrator sees two quiet gray icon controls on visible work cards.
3. Hiding removes the card from the entry; the hidden row remains recoverable in space management.
4. The custom URL suffix help opens to the right without clipping.
5. Space management displays uploader labels and separated action buttons.
6. Dashboard shows delete-space controls for active and expired spaces.
7. Canceling confirmation changes nothing; confirming removes the space row.

Expected: no horizontal overlap, clipped tooltip, duplicate administrator “关闭” action, or hidden work on the public entry.

- [ ] **Step 6: Check the final change scope**

```powershell
git status --short
git diff --check
git log --oneline --decorate -7
```

Expected: no uncommitted files, no whitespace errors, and one focused commit for each implementation task after the design and plan commits.
