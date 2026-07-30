# Space Selector and Dashboard Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual space-ID entry with an account-scoped selector and reusable creation modal, redirect authentication to uploading, present personal history as a table, and apply the approved homepage copy.

**Architecture:** Add one shared `CreateSpaceModal` that owns the existing `POST /spaces` request and returns the created `Space` to its caller. `UploadPage` loads spaces only for the current user, handles the create-space intent, and keeps the existing upload endpoints; `DashboardPage` reuses the modal and admin table styles. Authentication uses a small allowlist for post-login destinations so query parameters cannot create an external redirect.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Axios, Vitest, Testing Library, CSS

## Global Constraints

- The default upload target is `仅个人上传（不加入空间）`.
- The first selectable space item is `+ 新建空间`; existing spaces follow it.
- Visitors do not request or see existing spaces.
- Visitors selecting `+ 新建空间` enter registration, return to `/upload?createSpace=1`, and see the creation modal.
- The shared modal labels its second field `自定义网址后缀` while sending the existing `slug` property.
- Normal login and registration finish at `/upload`.
- The server remains authoritative for authentication, space ownership, slug validation, and upload permissions.
- Do not add server endpoints, database changes, migrations, dependencies, credentials, uploads, or environment files.
- Use TDD: each production change follows a failing focused test.

---

## File Map

- Create `web/src/components/CreateSpaceModal.tsx`: shared new-space dialog and `POST /spaces` request.
- Create `web/src/components/CreateSpaceModal.test.tsx`: modal form, plain-language label, success and error behavior.
- Modify `web/src/pages/LoginPage.tsx`: registration mode from URL and allowlisted post-auth destination.
- Modify `web/src/App.test.tsx`: login and registration redirects.
- Modify `web/src/pages/UploadPage.tsx`: account space selector, create intent, aligned settings and conditional message.
- Modify `web/src/pages/UploadPage.test.tsx`: visitor and member selector behavior, upload `spaceId`, modal continuation.
- Modify `web/src/pages/DashboardPage.tsx`: modal-based space creation and personal deployment table.
- Modify `web/src/pages/DashboardPage.test.tsx`: creation button/modal and table semantics.
- Modify `web/src/pages/HomePage.tsx`: approved Slogan, summary and feature titles.
- Modify `web/src/pages/HomePage.test.tsx`: exact homepage copy and removal of eyebrow labels.
- Modify `web/src/App.test.tsx`: updated homepage heading.
- Modify `web/src/styles.css`: settings grid, select controls, modal, dashboard table and feature-heading appearance.

### Task 1: Shared Create-Space Modal

**Files:**
- Create: `web/src/components/CreateSpaceModal.test.tsx`
- Create: `web/src/components/CreateSpaceModal.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `api.post("/spaces", { name, slug: slug || undefined })` and `Space` from `web/src/types.ts`.
- Produces:

```ts
type CreateSpaceModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (space: Space) => void;
};
```

- [ ] **Step 1: Write the failing modal tests**

Create `web/src/components/CreateSpaceModal.test.tsx` with tests that:

```tsx
render(<CreateSpaceModal open onClose={onClose} onCreated={onCreated} />);
expect(screen.getByRole("dialog", { name: "新建空间" })).toBeInTheDocument();
expect(screen.getByRole("textbox", { name: "空间名称" })).toBeInTheDocument();
expect(screen.getByRole("textbox", { name: "自定义网址后缀" })).toBeInTheDocument();
expect(screen.queryByText(/slug/i)).not.toBeInTheDocument();
```

Then submit `作品空间` and `class-work`, assert:

```tsx
expect(api.post).toHaveBeenCalledWith("/spaces", {
  name: "作品空间",
  slug: "class-work",
});
expect(onCreated).toHaveBeenCalledWith(createdSpace);
```

Add one test where `api.post` rejects with `{ response: { data: { message: "网址后缀已存在" } } }` and assert that message is visible.

- [ ] **Step 2: Run the modal test and verify RED**

Run:

```bash
cd web
npm.cmd test -- src/components/CreateSpaceModal.test.tsx
```

Expected: FAIL because `CreateSpaceModal` does not exist.

- [ ] **Step 3: Implement the shared modal**

Create `web/src/components/CreateSpaceModal.tsx`:

```tsx
import { useState } from "react";

import { api } from "../api";
import type { Space } from "../types";

type CreateSpaceModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (space: Space) => void;
};

export function CreateSpaceModal({
  open,
  onClose,
  onCreated,
}: CreateSpaceModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function createSpace() {
    setSubmitting(true);
    setMessage("");
    try {
      const { data } = await api.post<Space>("/spaces", {
        name,
        slug: slug || undefined,
      });
      setName("");
      setSlug("");
      onCreated(data);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "创建空间失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-modal-overlay" role="presentation">
      <section
        className="space-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-space-title"
      >
        <h2 id="create-space-title">新建空间</h2>
        <label>
          空间名称
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          自定义网址后缀
          <input value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>
        {message && <p className="message" role="status">{message}</p>}
        <div className="space-modal-actions">
          <button type="button" disabled={submitting} onClick={onClose}>取消</button>
          <button type="button" disabled={submitting || !name.trim()} onClick={() => void createSpace()}>
            {submitting ? "正在创建…" : "创建空间"}
          </button>
        </div>
      </section>
    </div>
  );
}
```

Add focused modal overlay, panel, field spacing and action styles to `web/src/styles.css`.

- [ ] **Step 4: Run the modal tests and verify GREEN**

Run:

```bash
cd web
npm.cmd test -- src/components/CreateSpaceModal.test.tsx
```

Expected: all modal tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add web/src/components/CreateSpaceModal.tsx web/src/components/CreateSpaceModal.test.tsx web/src/styles.css
git commit -m "Add shared space creation modal"
```

### Task 2: Authentication Redirects

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: URL query keys `mode=register` and `next=/upload?createSpace=1`.
- Produces: normal destination `/upload`; allowlisted create destination `/upload?createSpace=1`.

- [ ] **Step 1: Write failing redirect tests**

In `web/src/App.test.tsx`, add tests that mock successful authentication and assert:

```tsx
vi.spyOn(api, "post").mockResolvedValue({
  data: {
    token: "user-token",
    user: {
      id: "u2",
      username: "member",
      role: "USER",
      createdAt: "2026-07-29T01:00:00.000Z",
    },
  },
});
vi.spyOn(api, "get").mockResolvedValue({ data: [] });
const user = userEvent.setup();
renderApp("/login");
await user.type(screen.getByRole("textbox", { name: "用户名" }), "member");
await user.type(screen.getByLabelText("密码"), "password123");
await user.click(screen.getAllByRole("button", { name: "登录" }).at(-1)!);
expect(await screen.findByRole("heading", { name: "上传并部署" })).toBeInTheDocument();
```

Render `/login?mode=register`, assert the `账号注册` heading is selected immediately, fill username, password and confirmation, click `注册并登录`, and assert it also reaches `上传并部署`.

Add a malicious destination test using `next=https://example.com` and assert successful authentication still lands on `/upload`.

- [ ] **Step 2: Run App tests and verify RED**

Run:

```bash
cd web
npm.cmd test -- src/App.test.tsx
```

Expected: FAIL because login still navigates to `/dashboard` and query mode is ignored.

- [ ] **Step 3: Implement allowlisted redirects**

In `LoginPage.tsx`, use `useSearchParams`:

```tsx
const [searchParams] = useSearchParams();
const [mode, setMode] = useState<Mode>(
  searchParams.get("mode") === "register" ? "register" : "login",
);
const requestedNext = searchParams.get("next");
const destination = requestedNext === "/upload?createSpace=1"
  ? requestedNext
  : "/upload";
```

Replace both `navigate("/dashboard")` calls with `navigate(destination)`. Do not accept arbitrary external or protocol-relative destinations.

- [ ] **Step 4: Run App tests and verify GREEN for normal redirects**

Run:

```bash
cd web
npm.cmd test -- src/App.test.tsx
```

Expected: all authentication redirect tests PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add web/src/App.test.tsx web/src/pages/LoginPage.tsx
git commit -m "Redirect authentication to uploading"
```

### Task 3: Upload Space Selector and Creation Continuation

**Files:**
- Modify: `web/src/pages/UploadPage.test.tsx`
- Modify: `web/src/pages/UploadPage.tsx`
- Modify: `web/src/styles.css`
- Verify: `web/src/App.test.tsx`

**Interfaces:**
- Consumes: `CreateSpaceModal`, `GET /spaces`, `Space[]`, `createSpace=1`.
- Produces: `spaceId` selected from current-user spaces and appended to existing upload `FormData`.

- [ ] **Step 1: Replace the old field tests with failing selector tests**

Cover a visitor:

```tsx
expect(screen.getByRole("combobox", { name: "上传到空间" })).toHaveValue("");
expect(screen.getByRole("option", { name: "仅个人上传（不加入空间）" })).toBeInTheDocument();
expect(screen.getAllByRole("option")[1]).toHaveTextContent("+ 新建空间");
expect(api.get).not.toHaveBeenCalledWith("/spaces");
expect(screen.queryByText("拖拽 HTML 文件或文件夹，匿名部署默认 3 小时。")).not.toBeInTheDocument();
```

After selecting `+ 新建空间`, assert the current route shows `账号注册`.

Add the create-intent integration test here:

```tsx
vi.spyOn(api, "post").mockResolvedValue({
  data: {
    token: "user-token",
    user: {
      id: "u2",
      username: "member",
      role: "USER",
      createdAt: "2026-07-29T01:00:00.000Z",
    },
  },
});
vi.spyOn(api, "get").mockResolvedValue({ data: [] });
const user = userEvent.setup();
renderApp("/login?mode=register&next=%2Fupload%3FcreateSpace%3D1");
expect(screen.getByRole("heading", { name: "账号注册" })).toBeInTheDocument();
await user.type(screen.getByRole("textbox", { name: "用户名" }), "member");
await user.type(screen.getByLabelText("密码"), "password123");
await user.type(screen.getByLabelText("确认密码"), "password123");
await user.click(screen.getByRole("button", { name: "注册并登录" }));
expect(await screen.findByRole("dialog", { name: "新建空间" })).toBeInTheDocument();
```

Cover a signed-in user with `api.get("/spaces")` returning two `Space` records. Assert both names appear, select one, upload an HTML file, click `登录后部署`, and inspect the submitted `FormData`:

```tsx
expect(formData.get("spaceId")).toBe("s1");
```

Render `/upload?createSpace=1` while signed in and assert the shared dialog opens. Create a new space and assert the selector automatically becomes that new space ID.

Wrap direct `UploadPage` renders in `MemoryRouter`, with an `initialEntries` parameter for the create-intent case, because `UploadPage` now uses router navigation and search parameters.

- [ ] **Step 2: Run UploadPage and App tests and verify RED**

Run:

```bash
cd web
npm.cmd test -- src/pages/UploadPage.test.tsx src/App.test.tsx
```

Expected: FAIL because the text input, initial message, missing space loading and missing modal do not satisfy the new behavior.

- [ ] **Step 3: Implement the selector and account-scoped loading**

In `UploadPage.tsx`:

- initialize `message` to `""`;
- use `useEffect`, `useNavigate`, and `useSearchParams`;
- call `setAuthToken(localStorage.getItem("token") ?? undefined)` and `api.get<Space[]>("/spaces")` only when `getCurrentUser()` is non-null;
- render:

```tsx
<select
  id="space-id"
  value={spaceId}
  onChange={(event) => {
    if (event.target.value === "__create_space__") {
      setSpaceId("");
      if (!isLoggedIn) {
        navigate("/login?mode=register&next=%2Fupload%3FcreateSpace%3D1");
      } else {
        setCreateSpaceOpen(true);
      }
      return;
    }
    setSpaceId(event.target.value);
  }}
>
  <option value="" hidden>仅个人上传（不加入空间）</option>
  <option value="__create_space__">+ 新建空间</option>
  {spaces.map((space) => (
    <option key={space.id} value={space.id}>{space.name}</option>
  ))}
</select>
```

Add “在一个空间里分享所有人的作品” next to the label. Render the modal and on success append the new space, select its ID, close the modal, and remove the `createSpace` query flag.

Render the message element only when `message` is non-empty.

- [ ] **Step 4: Align and separate the settings controls**

Replace the generic `.row` wrapper with `.upload-settings`. Add CSS:

```css
.upload-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  align-items: end;
  gap: 28px;
  max-width: 620px;
  margin: 22px 0 14px;
}

.upload-setting-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

input,
select {
  box-sizing: border-box;
  min-height: 42px;
}
```

Add a mobile rule that changes `.upload-settings` to one column.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
cd web
npm.cmd test -- src/pages/UploadPage.test.tsx src/App.test.tsx
```

Expected: selector, continuation, upload endpoint and authentication tests PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add web/src/pages/UploadPage.test.tsx web/src/pages/UploadPage.tsx web/src/App.test.tsx web/src/styles.css
git commit -m "Add account space selector to uploading"
```

### Task 4: Dashboard Creation Button and Personal Upload Table

**Files:**
- Modify: `web/src/pages/DashboardPage.test.tsx`
- Modify: `web/src/pages/DashboardPage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `CreateSpaceModal`, `getPersonalDeploymentStatus`, `Space`, existing `GET /deployments` and `GET /spaces`.
- Produces: table columns `网页`, `上传时间`, `到期时间`, `状态`, `操作`.

- [ ] **Step 1: Write failing dashboard tests**

Change row lookups from `closest("article")` to `closest("tr")`. Assert the table headers and all four statuses:

```tsx
expect(screen.getByRole("columnheader", { name: "网页" })).toBeInTheDocument();
expect(screen.getByRole("columnheader", { name: "上传时间" })).toBeInTheDocument();
expect(screen.getByRole("columnheader", { name: "到期时间" })).toBeInTheDocument();
expect(screen.getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
```

Assert only the normal row has an `访问` link.

In the spaces test, after selecting `空间管理`, assert no directly visible `空间名称` field exists. Click `新建空间`, assert the shared dialog and `自定义网址后缀` field appear, submit, and verify the space list reloads.

- [ ] **Step 2: Run DashboardPage tests and verify RED**

Run:

```bash
cd web
npm.cmd test -- src/pages/DashboardPage.test.tsx
```

Expected: FAIL because personal deployments are articles and the creation form is inline.

- [ ] **Step 3: Implement the dashboard table**

Replace `.deployment-list` articles with:

```tsx
<div className="admin-table-scroll">
  <table className="admin-table dashboard-table">
    <thead>
      <tr>
        <th>网页</th>
        <th>上传时间</th>
        <th>到期时间</th>
        <th>状态</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      {deployments.map((deployment) => {
        const status = getPersonalDeploymentStatus(deployment);
        return (
          <tr key={deployment.id}>
            <td>
              <strong>{deployment.title}</strong>
              <span className="admin-page-link">/p/{deployment.publicSlug}</span>
            </td>
            <td>{new Date(deployment.createdAt).toLocaleString("zh-CN")}</td>
            <td>{new Date(deployment.expiresAt).toLocaleString("zh-CN")}</td>
            <td>
              <span className={`dashboard-status dashboard-status-${statusClassNames[status]}`}>
                {status}
              </span>
            </td>
            <td>
              {status === "正常"
                ? <a href={`/p/${deployment.publicSlug}`} target="_blank" rel="noreferrer">访问</a>
                : <span className="dashboard-unavailable">不可访问</span>}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
```

- [ ] **Step 4: Replace the inline space form with the modal**

Remove `name`, `slug`, and the old `createSpace()` function. Add `createSpaceOpen`. Render a `新建空间` button and `CreateSpaceModal`; after creation close the dialog, show `创建成功：入口 /s/{space.slug}`, and call `loadSpaces()`.

- [ ] **Step 5: Run dashboard tests and verify GREEN**

Run:

```bash
cd web
npm.cmd test -- src/pages/DashboardPage.test.tsx
```

Expected: all dashboard tests PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add web/src/pages/DashboardPage.test.tsx web/src/pages/DashboardPage.tsx web/src/styles.css
git commit -m "Present personal uploads as a table"
```

### Task 5: Homepage Copy and Feature Styling

**Files:**
- Modify: `web/src/pages/HomePage.test.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/HomePage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Produces exact heading `一键部署，随时分享。`, exact summary, and feature headings `一键部署`, `立即分享`, `统一管理`.

- [ ] **Step 1: Write failing homepage assertions**

Update the heading assertions to:

```tsx
const heading = main.getByRole("heading", { name: "一键部署，随时分享。" });
expect(within(heading).getByText("一键部署，")).toHaveClass("home-title-line");
expect(within(heading).getByText("随时分享。")).toHaveClass("home-title-line");
expect(main.getByText("上传 HTML 文件或完整网页文件夹，立即获得一个可分享的访问链接。")).toBeInTheDocument();
```

Within `主要功能`, assert the three headings and absence of all old eyebrow labels and titles:

```tsx
expect(features.getByRole("heading", { name: "一键部署" })).toBeInTheDocument();
expect(features.getByRole("heading", { name: "立即分享" })).toBeInTheDocument();
expect(features.getByRole("heading", { name: "统一管理" })).toBeInTheDocument();
expect(features.queryByText("选择文件")).not.toBeInTheDocument();
expect(features.queryByText("完成发布")).not.toBeInTheDocument();
expect(features.queryByText("集中整理")).not.toBeInTheDocument();
expect(features.queryByText("上传网页")).not.toBeInTheDocument();
expect(features.queryByText("注册后管理")).not.toBeInTheDocument();
```

Update the equivalent homepage heading assertion in `App.test.tsx`.

- [ ] **Step 2: Run homepage tests and verify RED**

Run:

```bash
cd web
npm.cmd test -- src/pages/HomePage.test.tsx src/App.test.tsx
```

Expected: FAIL with the old Slogan and old feature copy.

- [ ] **Step 3: Implement the exact copy**

In `HomePage.tsx`:

- change the first heading line to `一键部署，`;
- use the exact approved summary;
- remove all three feature `<span>` elements;
- use headings `一键部署`, `立即分享`, `统一管理`.

In `styles.css`, remove the unused `.home-features span` rule and update:

```css
.home-features h3 {
  margin: 0 0 12px;
  color: #246bfd;
  font-size: 24px;
}
```

- [ ] **Step 4: Run homepage tests and verify GREEN**

Run:

```bash
cd web
npm.cmd test -- src/pages/HomePage.test.tsx src/App.test.tsx
```

Expected: all homepage and navigation tests PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add web/src/pages/HomePage.test.tsx web/src/App.test.tsx web/src/pages/HomePage.tsx web/src/styles.css
git commit -m "Refine homepage deployment copy"
```

### Task 6: Complete Verification

**Files:**
- Verification only.

- [ ] **Step 1: Run all server tests and build**

```bash
cd server
npm.cmd test
npm.cmd run build
```

Expected: 27 server tests PASS and TypeScript build exits 0.

- [ ] **Step 2: Run all frontend checks**

```bash
cd web
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Expected: all frontend tests PASS, type checking exits 0, and Vite creates `web/dist`.

- [ ] **Step 3: Browser acceptance at desktop size**

Start the local backend and frontend without changing production. Verify:

- homepage Slogan, summary and three blue feature headings;
- upload settings have equal-height controls with visible separation;
- the old initial blue message is absent;
- visitor create-space selection opens registration;
- registration continuation opens the modal;
- signed-in selector lists only API-returned spaces and selects a newly created space;
- dashboard uses the modal and personal-history table;
- no page console errors occur.

- [ ] **Step 4: Confirm repository hygiene**

```bash
git diff --check
git status -sb
```

Expected: only intended committed source and documentation changes; no `.env`, database, upload, credential, build output, or temporary browser artifacts.
