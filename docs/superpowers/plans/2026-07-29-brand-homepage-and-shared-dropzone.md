# Drop&Share Brand Homepage and Shared Dropzone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic site chrome and homepage with the approved Drop&Share publishing-workbench design, then give personal and space uploads one shared recursive drag-and-drop selector.

**Architecture:** Keep the existing routes and upload APIs. Add a focused `UploadDropzone` component that converts file inputs or a `DataTransfer` into `UploadEntry[]`; page components remain responsible for validation, metadata, authentication, and POST destinations. Update only the global navigation, homepage, the two upload pages, uploader utilities, tests, and their styles.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Vitest 4, Testing Library, CSS

## Global Constraints

- The global brand text is exactly `Drop & Share`, links to `/`, and replaces the non-link heading.
- The top-right navigation must not contain `首页`.
- The homepage slogan is exactly `随时部署，随时分享。`.
- The primary homepage action is `免费使用`, never `免费试用`.
- Personal and space uploads share one drag-and-drop component with `选择 HTML 文件` and `选择整个文件夹` fallbacks.
- A new selection or drop replaces the previous entries.
- Recursive drops preserve paths relative to the dropped root folder.
- Keep `POST /api/deployments/anonymous`, `POST /api/deployments`, and `POST /api/spaces/:id/deployments` separate.
- Do not change retention, authentication, authorization, database schema, or server upload handlers.
- Do not add or upgrade dependencies.
- Do not deploy, run production migrations, or modify production data during implementation.

---

## File Map

- `web/src/App.tsx`: linked global brand and account-aware navigation without a home item.
- `web/src/App.test.tsx`: navigation and brand regression coverage.
- `web/src/pages/HomePage.tsx`: approved slogan, publishing copy, and status-card structure.
- `web/src/pages/HomePage.test.tsx`: homepage content and destination coverage.
- `web/src/uploader.ts`: normalize file input and recursively traverse dropped directories.
- `web/src/uploader.test.ts`: path preservation, recursive traversal, and fallback tests.
- `web/src/components/UploadDropzone.tsx`: shared drag state, inputs, status, and accessible messaging.
- `web/src/components/UploadDropzone.test.tsx`: shared component behavior.
- `web/src/pages/UploadPage.tsx`: use the shared selector while preserving personal upload endpoints and validation.
- `web/src/pages/UploadPage.test.tsx`: personal-page selector and endpoint tests.
- `web/src/pages/SpaceEntryPage.tsx`: use the shared selector while preserving the space modal and endpoint.
- `web/src/pages/SpaceEntryPage.test.tsx`: space selector and endpoint tests.
- `web/src/styles.css`: approved brand, homepage, shared dropzone, focus, responsive, and reduced-motion styling.

---

### Task 1: Global brand navigation and publishing-workbench homepage

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/HomePage.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/pages/HomePage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Produces: a `Drop & Share` navigation link to `/`.
- Produces: homepage heading `随时部署，随时分享。`.
- Preserves: `/upload`, `/login`, `/dashboard`, and `/admin` destinations.

- [ ] **Step 1: Write failing brand and homepage tests**

Update the root-page test in `App.test.tsx`:

```tsx
expect(screen.getByRole("link", { name: "Drop & Share" })).toHaveAttribute("href", "/");
expect(within(screen.getByRole("navigation")).queryByText("首页")).not.toBeInTheDocument();
expect(within(screen.getByRole("main")).getByRole("heading", {
  name: "随时部署，随时分享。",
})).toBeInTheDocument();
```

Update `HomePage.test.tsx`:

```tsx
expect(main.getByRole("heading", { name: "随时部署，随时分享。" })).toBeInTheDocument();
expect(main.getByText("portfolio/index.html")).toBeInTheDocument();
expect(main.getByText("部署完成")).toBeInTheDocument();
expect(main.getByText("drop.yaoguosir.com/p/your-page")).toBeInTheDocument();
expect(main.getByRole("link", { name: "免费使用" })).toHaveAttribute("href", "/upload");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd web && npm test -- src/App.test.tsx src/pages/HomePage.test.tsx`

Expected: FAIL because the brand is not a link, `首页` still exists, and the old heading/status markup does not match.

- [ ] **Step 3: Implement the minimal approved structure**

Replace the navigation heading with:

```tsx
<Link className="navbar-brand" to="/" aria-label="Drop & Share 返回首页">
  Drop <span>&amp;</span> Share
</Link>
```

Remove the `首页` navigation link. Keep the remaining user/admin conditions unchanged.

Build `HomePage` as:

```tsx
<section className="home-page">
  <div className="home-hero">
    <div className="home-copy">
      <p className="home-eyebrow">DROP &amp; SHARE</p>
      <h1>随时部署，随时分享。</h1>
      <p className="home-summary">上传单个 HTML 文件或完整网页文件夹，立即获得一个可以直接打开和分享的访问链接。</p>
      <div className="home-actions">...</div>
      <p className="home-retention">匿名上传默认保留 3 小时；登录后可选择 1–24 小时，并查看自己的上传记录。</p>
    </div>
    <aside className="deploy-card" aria-label="网页发布示例">
      <div className="deploy-card-file"><code>portfolio/index.html</code><span>部署完成</span></div>
      <div className="deploy-card-flow" aria-hidden="true"><span /><span /><span /></div>
      <div className="deploy-card-result"><small>访问链接</small><code>drop.yaoguosir.com/p/your-page</code></div>
    </aside>
  </div>
  <div className="home-features" aria-label="主要功能">...</div>
</section>
```

Use the exact copy and feature content from the approved spec.

- [ ] **Step 4: Apply the approved visual tokens**

In `styles.css`, set the page background to `#f7f9fc`, navigation to `#0c172a`, primary actions to `#246bfd`, deploy card to `#edf4ff`, and success state to `#087a48` on `#d5f7e6`.

Use `Bahnschrift` for display text, `Microsoft YaHei`/`PingFang SC` for body text, and `Consolas` for example paths. Use a two-column hero above 760px and a single column below it. Add visible `:focus-visible` rules and a `prefers-reduced-motion: reduce` rule.

- [ ] **Step 5: Verify GREEN**

Run: `cd web && npm test -- src/App.test.tsx src/pages/HomePage.test.tsx && npm run typecheck`

Expected: all focused tests PASS and typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/App.test.tsx web/src/pages/HomePage.tsx web/src/pages/HomePage.test.tsx web/src/styles.css
git commit -m "Redesign Drop and Share homepage"
```

---

### Task 2: Recursive dropped-file collection

**Files:**
- Create: `web/src/uploader.test.ts`
- Modify: `web/src/uploader.ts`

**Interfaces:**
- Preserves: `collectUploadEntries(files: FileList | null): UploadEntry[]`.
- Produces: `collectDroppedEntries(dataTransfer: DataTransfer): Promise<UploadEntry[]>`.
- Produces: `UploadEntry = { file: File; path: string }`.

- [ ] **Step 1: Write failing uploader utility tests**

Test normal file inputs:

```ts
it("uses webkitRelativePath when a folder was selected", () => {
  const file = new File(["html"], "index.html", { type: "text/html" });
  Object.defineProperty(file, "webkitRelativePath", { value: "site/index.html" });
  expect(collectUploadEntries({ 0: file, length: 1, item: () => file } as FileList))
    .toEqual([{ file, path: "site/index.html" }]);
});
```

Create small fake `FileSystemFileEntry` and `FileSystemDirectoryEntry` objects and verify:

```ts
await expect(collectDroppedEntries(dataTransfer)).resolves.toEqual([
  { file: indexFile, path: "site/index.html" },
  { file: cssFile, path: "site/assets/app.css" },
]);
```

Add a fallback test where `webkitGetAsEntry` is absent and `dataTransfer.files` contains `index.html`.

- [ ] **Step 2: Run and verify RED**

Run: `cd web && npm test -- src/uploader.test.ts`

Expected: FAIL because `collectDroppedEntries` does not exist.

- [ ] **Step 3: Implement minimal recursive traversal**

Add internal promise adapters:

```ts
function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}
```

Read directory batches until an empty batch, recurse into children, and join path segments with `/`. For top-level directory entries, include the directory name in every result path. For top-level file entries, use the file name.

`collectDroppedEntries` must use recursive entries only when every usable item exposes `webkitGetAsEntry`; otherwise return `collectUploadEntries(dataTransfer.files)`. Ignore non-file items and sort the final entries by path for deterministic behavior.

- [ ] **Step 4: Verify GREEN**

Run: `cd web && npm test -- src/uploader.test.ts && npm run typecheck`

Expected: uploader tests PASS and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/uploader.ts web/src/uploader.test.ts
git commit -m "Support recursive folder drops"
```

---

### Task 3: Shared accessible upload dropzone

**Files:**
- Create: `web/src/components/UploadDropzone.tsx`
- Create: `web/src/components/UploadDropzone.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `collectUploadEntries`, `collectDroppedEntries`, and `UploadEntry`.
- Produces:

```ts
type UploadDropzoneProps = {
  entries: UploadEntry[];
  onEntriesChange: (entries: UploadEntry[]) => void;
  onError?: (message: string) => void;
};
```

- [ ] **Step 1: Write failing component tests**

Render `UploadDropzone` with an `onEntriesChange` spy and assert:

```tsx
expect(screen.getByText("拖拽文件或整个文件夹到这里")).toBeInTheDocument();
expect(screen.getByLabelText("选择 HTML 文件")).toHaveAttribute("type", "file");
expect(screen.getByLabelText("选择整个文件夹")).toHaveAttribute("webkitdirectory", "true");
expect(screen.getByText("已选 0 个文件")).toHaveAttribute("aria-live", "polite");
```

Use `fireEvent.change` on each input and verify the new array is sent once. Use `fireEvent.dragOver` and `fireEvent.dragLeave` to verify the active class. Mock `collectDroppedEntries`, drop a data transfer, and verify it replaces the prior `entries` by calling `onEntriesChange` with only the dropped list.

Add an error test where recursive collection rejects and assert `onError("无法读取拖入的文件，请重新选择。")`.

- [ ] **Step 2: Run and verify RED**

Run: `cd web && npm test -- src/components/UploadDropzone.test.tsx`

Expected: FAIL because `UploadDropzone` does not exist.

- [ ] **Step 3: Implement the shared component**

Use a single semantic section:

```tsx
<section
  className={`upload-dropzone${dragging ? " upload-dropzone-active" : ""}`}
  aria-label="上传网页文件"
  onDragEnter={handleDragEnter}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  <div className="upload-dropzone-mark" aria-hidden="true">↑</div>
  <p className="upload-dropzone-title">拖拽文件或整个文件夹到这里</p>
  <p className="upload-dropzone-subtitle">支持 HTML、CSS、JavaScript、图片和字体等静态资源。</p>
  <div className="upload-actions">...</div>
  <p className="upload-selection-status" aria-live="polite">已选 {entries.length} 个文件</p>
</section>
```

Catch drop-read failures, send the exact error message to `onError`, and do not change entries on failure. Both input handlers call `onEntriesChange(collectUploadEntries(event.currentTarget.files))`.

- [ ] **Step 4: Add focused component styling**

Style the zone with a dashed `#9bb7e8` border, pale-blue surface, navy copy, cobalt active state, and visible focus on both labels. Hide native inputs without removing their labels from the accessibility tree. Keep buttons visually grouped within the same dropzone.

- [ ] **Step 5: Verify GREEN**

Run: `cd web && npm test -- src/components/UploadDropzone.test.tsx && npm run typecheck`

Expected: component tests PASS and typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/UploadDropzone.tsx web/src/components/UploadDropzone.test.tsx web/src/styles.css
git commit -m "Add shared upload dropzone"
```

---

### Task 4: Use the shared selector on personal and space uploads

**Files:**
- Modify: `web/src/pages/UploadPage.test.tsx`
- Create: `web/src/pages/SpaceEntryPage.test.tsx`
- Modify: `web/src/pages/UploadPage.tsx`
- Modify: `web/src/pages/SpaceEntryPage.tsx`

**Interfaces:**
- Consumes: `UploadDropzone` and `UploadEntry[]`.
- Preserves: anonymous `POST /deployments/anonymous`.
- Preserves: authenticated `POST /deployments`.
- Preserves: space `POST /spaces/:id/deployments`.

- [ ] **Step 1: Write failing personal-upload tests**

Update `UploadPage.test.tsx` to expect the shared dropzone text and both labeled inputs. Mock `api.post`, select a single HTML file, click `匿名部署`, and assert:

```ts
expect(api.post).toHaveBeenCalledWith("/deployments/anonymous", expect.any(FormData));
```

Set a token/user only if needed for the existing authenticated action, click `登录后部署`, and assert the endpoint remains `/deployments`.

- [ ] **Step 2: Write failing space-upload tests**

Mock `api.get("/spaces/entry/demo")` with one empty space. Render `SpaceEntryPage` under a memory router route `/s/:spaceSlug`. Assert the shared dropzone and both labeled inputs exist.

Select `index.html`, click `上传到该空间`, enter `作品集`, confirm, then assert:

```ts
expect(api.post).toHaveBeenCalledWith("/spaces/space-1/deployments", expect.any(FormData));
```

Inspect the `FormData` and verify `title` is `作品集`, `paths` includes `index.html`, and `files` contains the selected file.

- [ ] **Step 3: Run and verify RED**

Run: `cd web && npm test -- src/pages/UploadPage.test.tsx src/pages/SpaceEntryPage.test.tsx`

Expected: FAIL because both pages do not yet render the shared component and the space page lacks the second fallback input.

- [ ] **Step 4: Integrate the personal upload page**

Replace the two local file labels with:

```tsx
<UploadDropzone
  entries={entries}
  onEntriesChange={setEntries}
  onError={setMessage}
/>
```

Keep `hasIndex`, duration, optional space ID, FormData construction, anonymous/authenticated endpoints, and success/error messages unchanged. Remove the now-unused `collectUploadEntries` import and duplicate selected-count text.

- [ ] **Step 5: Integrate the space entry page**

Replace `dragging`, `handleDrop`, `handleDragOver`, `handleDragLeave`, and the local folder label with the same `UploadDropzone`.

Keep loading, project-name modal validation, space endpoint, ownership checks, close action, and list refresh unchanged. Use `onError={setMessage}`.

- [ ] **Step 6: Verify GREEN**

Run: `cd web && npm test -- src/pages/UploadPage.test.tsx src/pages/SpaceEntryPage.test.tsx && npm run typecheck`

Expected: both page tests PASS and typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/UploadPage.tsx web/src/pages/UploadPage.test.tsx web/src/pages/SpaceEntryPage.tsx web/src/pages/SpaceEntryPage.test.tsx
git commit -m "Unify personal and space upload selection"
```

---

### Task 5: Full verification and visual critique

**Files:**
- Modify only files already listed if verification exposes a defect.

**Interfaces:**
- Produces: a locally verified branch ready for separately authorized backup and deployment.

- [ ] **Step 1: Run all server checks**

Run: `cd server && npm test && npm run build`

Expected: all server tests PASS and the server build succeeds.

- [ ] **Step 2: Run all frontend checks**

Run: `cd web && npm test && npm run typecheck && npm run build`

Expected: all frontend tests PASS, typecheck PASS, and the production frontend build succeeds.

- [ ] **Step 3: Start a local preview and capture desktop and mobile screenshots**

Run the built frontend through the existing Vite preview command. Capture `/` at approximately 1440×900 and 390×844, plus `/upload` at desktop width.

Verify:

- slogan and primary action are visible without scrolling;
- deploy status card is the only dominant decorative element;
- navigation wraps without overlap;
- both upload choices visually belong to one dropzone;
- focus rings remain visible;
- no `首页` item or duplicate native input appears.

- [ ] **Step 4: Apply only evidence-based visual fixes**

If screenshots reveal spacing, overflow, contrast, or hierarchy defects, first add a focused regression test where practical, then make the smallest CSS or markup correction and rerun the affected tests.

- [ ] **Step 5: Inspect repository safety**

Run:

```bash
git diff --check
git status --short
git log -6 --oneline
git diff origin/codex/admin-dashboard...HEAD -- .env server/.env web/.env server/storage
```

Expected: no whitespace errors, no uncommitted implementation files, one commit per completed task, and no environment files, uploads, databases, credentials, or production backups.

- [ ] **Step 6: Report**

Report the implemented behavior, exact test/build results, screenshots reviewed, commits created, absence of migrations, and that production remains unchanged. Do not deploy without a new explicit production action.
