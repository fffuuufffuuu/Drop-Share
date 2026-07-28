# Drop&Share Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-enforced admin dashboard where `fffuuu` can view, ZIP-download, and permanently delete every personal deployment and every space.

**Architecture:** Add a database-backed user role and an async admin middleware that checks the database on every request. Keep all privileged reads, archive streams, and destructive actions under a dedicated `/api/admin` router. Add a protected React `/admin` page with personal-upload and space views, while preserving all existing user-facing routes.

**Tech Stack:** TypeScript, Express 5, Prisma 6/MySQL, React 19, React Router 7, Axios, Vitest, Supertest, Testing Library, Archiver

## Global Constraints

- Personal uploads are deployments whose `spaceId` is `null`, including authenticated and anonymous uploads.
- Anonymous uploads display the owner as `匿名`.
- Admin identity is stored in the database; `fffuuu` is promoted by the migration.
- `/admin` reuses the existing login flow and is unavailable to ordinary users.
- Single deployments and whole spaces download as ZIP files generated on demand.
- Deletions are immediate and permanent, with an explicit confirmation in the UI.
- File removal must finish before related database records are permanently deleted.
- This implementation is local only; do not deploy or modify production data.
- Do not commit `.env`, database contents, uploaded files, passwords, tokens, or server absolute paths.

---

## File Map

- `server/prisma/schema.prisma`: add `UserRole` and `User.role`.
- `server/prisma/migrations/20260729000000_add_user_role/migration.sql`: add the role column and promote `fffuuu`.
- `server/src/middleware.ts`: add database-backed `requireAdmin`.
- `server/src/routes.auth.ts`: include the public `role` field in login and registration responses.
- `server/src/archive.ts`: sanitize ZIP names and stream deployment folders.
- `server/src/admin-deletion.ts`: coordinate permanent file-first deletion.
- `server/src/routes.admin.ts`: privileged list, download, and delete endpoints.
- `server/src/index.ts`: mount `/api/admin`.
- `server/src/*.test.ts`: server permission, listing, archive, and deletion tests.
- `web/src/types.ts`: add user and admin response types.
- `web/src/auth.ts`: read the stored current user safely.
- `web/src/App.tsx`: show the admin navigation entry and add `/admin`.
- `web/src/pages/AdminPage.tsx`: render personal uploads, spaces, detail, downloads, and confirmations.
- `web/src/pages/AdminPage.test.tsx`: exercise both panels and destructive confirmations.
- `web/src/styles.css`: add only the admin-page layout and danger-action styles.

---

### Task 1: Database-backed administrator identity

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260729000000_add_user_role/migration.sql`
- Modify: `server/src/middleware.ts`
- Modify: `server/src/routes.auth.ts`
- Create: `server/src/middleware.test.ts`
- Modify: `server/package.json`

**Interfaces:**
- Produces: Prisma enum `UserRole` with `USER` and `ADMIN`.
- Produces: `requireAdmin(req, res, next): Promise<void>`.
- Produces: login and registration `user.role`.

- [ ] **Step 1: Add the failing middleware tests**

Mock `prisma.user.findUnique` and call `requireAdmin` with requests that contain an authenticated user. Assert that an `ADMIN` calls `next`, a `USER` receives 403, and a missing user receives 401.

```ts
it("allows a database-backed ADMIN", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: "ADMIN" } as never);
  const req = { authUser: { userId: "u1", username: "fffuuu" } } as Request;
  await requireAdmin(req, res, next);
  expect(next).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `cd server && npm test -- middleware.test.ts`

Expected: FAIL because `requireAdmin` and the test script do not exist yet.

- [ ] **Step 3: Add Vitest and the role migration**

Add `"test": "vitest run"` to `server/package.json` and install `vitest` plus `supertest` and `@types/supertest` as development dependencies.

Add to the Prisma schema:

```prisma
enum UserRole {
  USER
  ADMIN
}

model User {
  role UserRole @default(USER)
}
```

Create migration SQL:

```sql
ALTER TABLE `User`
  ADD COLUMN `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER';

UPDATE `User`
SET `role` = 'ADMIN'
WHERE `username` = 'fffuuu';
```

- [ ] **Step 4: Implement server-enforced admin authorization**

Keep the JWT payload unchanged. In `requireAdmin`, reject missing `req.authUser`, query the current user by ID with `select: { role: true }`, and allow only `UserRole.ADMIN`. Add `role: user.role` to both public auth responses.

```ts
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.authUser) {
    res.status(401).json({ message: "请先登录" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.authUser.userId },
    select: { role: true },
  });
  if (!user || user.role !== UserRole.ADMIN) {
    res.status(403).json({ message: "仅管理员可访问" });
    return;
  }
  next();
}
```

- [ ] **Step 5: Generate Prisma Client and run tests**

Run: `cd server && npx prisma generate && npm test -- middleware.test.ts`

Expected: all middleware tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/prisma server/src/middleware.ts server/src/middleware.test.ts server/src/routes.auth.ts
git commit -m "Add database-backed admin role"
```

---

### Task 2: Administrator list endpoints

**Files:**
- Create: `server/src/routes.admin.ts`
- Create: `server/src/routes.admin.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireAdmin`.
- Produces: `GET /api/admin/deployments/personal`.
- Produces: `GET /api/admin/spaces`.
- Produces: `GET /api/admin/spaces/:id`.

- [ ] **Step 1: Write failing route tests**

Mount `adminRouter` in a small Express test app. Mock Prisma and authentication. Verify:

```ts
expect(prisma.deployment.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: { spaceId: null, deletedAt: null },
}));
expect(personal.body[0].ownerLabel).toBe("匿名");
expect(spaces.body[0]).toMatchObject({ deploymentCount: 2, ownerUsername: "owner" });
```

Also verify that the detail route returns 404 for an unknown space and returns only `deletedAt: null` deployments for a known space.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd server && npm test -- routes.admin.test.ts`

Expected: FAIL because `routes.admin.ts` does not exist.

- [ ] **Step 3: Implement minimal list routes**

Create a router that applies both guards before every handler:

```ts
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);
```

For personal deployments, query `spaceId: null, deletedAt: null`, include owner username, sort newest first, and map `ownerLabel` to the username or `"匿名"`.

For spaces, include owner username and `_count.deployments` filtered to `deletedAt: null`. For space detail, return the space metadata and its non-deleted deployments. Return only IDs, titles, slugs, visibility, timestamps, owner labels, and counts—never `rootPath` or `passwordHash`.

- [ ] **Step 4: Mount and test**

In `server/src/index.ts`:

```ts
app.use("/api/admin", adminRouter);
```

Run: `cd server && npm test -- routes.admin.test.ts`

Expected: all list-route tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/src/routes.admin.ts server/src/routes.admin.test.ts
git commit -m "Add admin inventory endpoints"
```

---

### Task 3: ZIP download services and endpoints

**Files:**
- Create: `server/src/archive.ts`
- Create: `server/src/archive.test.ts`
- Modify: `server/src/routes.admin.ts`
- Modify: `server/src/routes.admin.test.ts`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `safeArchiveName(value: string, fallback: string): string`.
- Produces: `appendDeploymentFolder(archive, rootPath, prefix?): Promise<void>`.
- Produces: `GET /api/admin/deployments/:id/download`.
- Produces: `GET /api/admin/spaces/:id/download`.

- [ ] **Step 1: Write failing archive tests**

Use temporary directories containing `index.html` and nested assets. Verify sanitized names, preserved relative paths, and unique folder names for duplicate titles.

```ts
expect(safeArchiveName("../../bad:name", "site")).toBe("bad-name");
expect(uniqueArchiveFolders(["作品", "作品"])).toEqual(["作品", "作品-2"]);
```

Route tests must verify `Content-Type: application/zip`, a `.zip` disposition filename, 404 for absent records, and 409 when a root folder is missing.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd server && npm test -- archive.test.ts routes.admin.test.ts`

Expected: FAIL because archive helpers and download routes do not exist.

- [ ] **Step 3: Install archive dependencies**

Run: `cd server && npm install archiver && npm install -D @types/archiver adm-zip @types/adm-zip`

- [ ] **Step 4: Implement ZIP generation**

Use `fs.stat` to require an existing directory. Use Archiver with ZIP level 9 and stream directly to the response. A single deployment places its files at the ZIP root. A space prefixes each deployment with a sanitized, unique title folder.

```ts
archive.directory(deployment.rootPath, false);
archive.on("error", next);
archive.pipe(res);
await archive.finalize();
```

Set `Content-Disposition` with an ASCII fallback plus RFC 5987 UTF-8 filename so Chinese titles download correctly.

- [ ] **Step 5: Run archive tests**

Run: `cd server && npm test -- archive.test.ts routes.admin.test.ts`

Expected: all archive and download tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/src/archive.ts server/src/archive.test.ts server/src/routes.admin.ts server/src/routes.admin.test.ts
git commit -m "Add admin ZIP downloads"
```

---

### Task 4: Permanent file-first deletion

**Files:**
- Create: `server/src/admin-deletion.ts`
- Create: `server/src/admin-deletion.test.ts`
- Modify: `server/src/routes.admin.ts`
- Modify: `server/src/routes.admin.test.ts`

**Interfaces:**
- Produces: `permanentlyDeleteDeployment(id: string): Promise<"deleted" | "not-found">`.
- Produces: `permanentlyDeleteSpace(id: string): Promise<"deleted" | "not-found">`.
- Produces: `DELETE /api/admin/deployments/:id`.
- Produces: `DELETE /api/admin/spaces/:id`.

- [ ] **Step 1: Write failing deletion tests**

Verify this exact ordering:

```ts
expect(vi.mocked(removeDeploymentFolder).mock.invocationCallOrder[0])
  .toBeLessThan(vi.mocked(prisma.deployment.delete).mock.invocationCallOrder[0]);
```

Verify a file-removal rejection prevents database deletion. For a space, verify every deployment folder is removed before the Prisma transaction deletes deployment records and then the space. Verify unknown IDs return `"not-found"`.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd server && npm test -- admin-deletion.test.ts`

Expected: FAIL because deletion services do not exist.

- [ ] **Step 3: Implement deletion coordinators**

For a deployment, fetch only `id` and `rootPath`, remove the folder, then permanently delete the row.

For a space, fetch every non-deleted and deleted deployment root belonging to it, remove all folders, then use a Prisma transaction:

```ts
await prisma.$transaction([
  prisma.deployment.deleteMany({ where: { spaceId: id } }),
  prisma.space.delete({ where: { id } }),
]);
```

Do not change the existing owner-facing soft-delete route.

- [ ] **Step 4: Add admin DELETE routes**

Return 404 for `"not-found"`, 200 with a short success message for deletion, and pass filesystem failures to the central error handler without changing database rows.

- [ ] **Step 5: Run deletion and route tests**

Run: `cd server && npm test -- admin-deletion.test.ts routes.admin.test.ts`

Expected: all deletion and route tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/admin-deletion.ts server/src/admin-deletion.test.ts server/src/routes.admin.ts server/src/routes.admin.test.ts
git commit -m "Add permanent admin deletion"
```

---

### Task 5: Admin session state and protected navigation

**Files:**
- Modify: `web/src/types.ts`
- Create: `web/src/auth.ts`
- Create: `web/src/auth.test.ts`
- Modify: `web/src/App.tsx`
- Create: `web/src/App.test.tsx`
- Modify: `web/src/pages/LoginPage.tsx`
- Create: `web/src/pages/AdminPage.tsx`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `CurrentUser` with `role: "USER" | "ADMIN"`.
- Produces: `getCurrentUser(): CurrentUser | null`.
- Produces: `/admin` route and admin-only navigation entry.

- [ ] **Step 1: Add frontend tests and write failing auth tests**

Install Vitest, jsdom, Testing Library, and jest-dom. Add `"test": "vitest run"` to `web/package.json`.

Test valid admin JSON, ordinary user JSON, malformed JSON, and missing storage.

```ts
localStorage.setItem("user", JSON.stringify({ id: "u1", username: "fffuuu", role: "ADMIN" }));
expect(getCurrentUser()?.role).toBe("ADMIN");
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd web && npm test -- auth.test.ts`

Expected: FAIL because `getCurrentUser` does not exist.

- [ ] **Step 3: Implement current-user parsing**

Validate `id`, `username`, and role without throwing. Treat legacy stored users without a role as ordinary users. Keep the server as the final permission authority.

- [ ] **Step 4: Write the failing navigation test**

Render `App` with an admin in local storage and assert that the “管理后台” link points to `/admin`. Repeat with an ordinary user and assert that the link is absent.

- [ ] **Step 5: Add protected navigation and the initial access-gated page**

Use `getCurrentUser()` in `NavBar`; render “管理后台” only for `ADMIN`. Add `<Route path="/admin" element={<AdminPage />} />`. Create the initial `AdminPage` that shows “仅管理员可访问” to non-admin sessions and an “管理后台” heading to admins. Ensure login stores the role already returned by the server.

- [ ] **Step 6: Run auth and navigation tests**

Run: `cd web && npm test -- auth.test.ts App.test.tsx && npm run typecheck`

Expected: tests PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/src/types.ts web/src/auth.ts web/src/auth.test.ts web/src/App.tsx web/src/App.test.tsx web/src/pages/LoginPage.tsx web/src/pages/AdminPage.tsx
git commit -m "Add admin-aware web session"
```

---

### Task 6: Admin dashboard interface

**Files:**
- Modify: `web/src/pages/AdminPage.tsx`
- Create: `web/src/pages/AdminPage.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: the six `/api/admin` endpoints from Tasks 2–4.
- Produces: two-panel admin interface with space detail, ZIP downloads, and permanent-delete confirmations.

- [ ] **Step 1: Write failing page tests**

Mock Axios and render with a memory router. Verify:

- an ordinary user sees “仅管理员可访问” and no inventory request is sent;
- an admin sees “个人上传” and “空间”;
- anonymous records render “匿名”;
- clicking a space loads its detail;
- download actions request a Blob and trigger a browser download;
- deleting a deployment asks for confirmation before sending DELETE;
- deleting a space includes “空间及其中所有网页都会永久删除”.

```ts
await user.click(screen.getByRole("button", { name: "永久删除空间" }));
expect(screen.getByText(/空间及其中所有网页都会永久删除/)).toBeInTheDocument();
expect(api.delete).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd web && npm test -- AdminPage.test.tsx`

Expected: FAIL because the initial access-gated `AdminPage` does not yet contain the inventory interface.

- [ ] **Step 3: Implement loading and two-panel navigation**

On mount, reject non-admin local sessions, set the bearer token, and load personal deployments. Provide tab buttons for “个人上传” and “空间”. The space panel lists all spaces; selecting one loads its detail.

Use tables on wide screens and allow horizontal scrolling on small screens. Display loading, empty, success, and failure states in plain Chinese.

- [ ] **Step 4: Implement downloads**

Request downloads with `{ responseType: "blob" }`, read the server filename when available, create a temporary object URL, click a temporary anchor, then revoke the URL.

- [ ] **Step 5: Implement confirmation dialogs and deletion refresh**

Use an in-page modal rather than `window.confirm`. The modal names the exact deployment or space, explains permanence, offers “取消” and a red confirmation button, disables buttons while deleting, and refreshes the current list after success.

- [ ] **Step 6: Add focused styling**

Add only `.admin-*`, `.btn-danger`, and responsive table/modal rules. Match the existing dark navigation, white cards, blue links, and red destructive actions; do not redesign unrelated pages.

- [ ] **Step 7: Run page tests and build**

Run: `cd web && npm test -- AdminPage.test.tsx && npm run typecheck && npm run build`

Expected: tests PASS, typecheck PASS, and Vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/AdminPage.tsx web/src/pages/AdminPage.test.tsx web/src/styles.css
git commit -m "Build admin dashboard interface"
```

---

### Task 7: Full verification and local handoff

**Files:**
- Modify only if a failing check exposes a defect in files already listed above.

**Interfaces:**
- Produces: locally verified feature ready for a separately approved production deployment.

- [ ] **Step 1: Run the complete server verification**

Run: `cd server && npm test && npm run build`

Expected: every server test passes and TypeScript build succeeds.

- [ ] **Step 2: Run the complete web verification**

Run: `cd web && npm test && npm run typecheck && npm run build`

Expected: every web test passes, TypeScript reports no errors, and Vite build succeeds.

- [ ] **Step 3: Inspect migration and secrets**

Run:

```bash
git diff HEAD~6 --check
git status --short
git diff HEAD~6 -- .env server/.env web/.env storage
```

Expected: no whitespace errors, clean working tree, and no secrets or uploaded files in the diff.

- [ ] **Step 4: Review against the approved design**

Check every requirement in `docs/superpowers/specs/2026-07-29-admin-dashboard-design.md` against the implementation. Confirm that production has not been modified and no migration has been applied remotely.

- [ ] **Step 5: Commit any verification-only fix**

If and only if verification required a fix, stage only the affected files and create a narrowly named commit. Otherwise do not create an empty commit.

- [ ] **Step 6: Report the handoff**

Report implemented behavior, test/build results, migration presence, and the explicit fact that production remains unchanged. Ask separately before backup and deployment.
