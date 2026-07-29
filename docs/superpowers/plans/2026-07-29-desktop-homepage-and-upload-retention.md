# Desktop Homepage and Upload Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit the homepage's introduction, deploy preview, and three feature cards into a desktop first screen while making upload retention limits and space targeting clear for visitors and signed-in users.

**Architecture:** Keep the existing React pages and upload endpoints. Restructure only the homepage markup and CSS grid, then derive the upload duration limit from `getCurrentUser()` and clamp the controlled number input to that limit. The server remains the authority for authentication, space access, and retention validation.

**Tech Stack:** React 19, TypeScript 5.9, React Router, Vitest, Testing Library, CSS

## Global Constraints

- The heading must display `随时部署，` on the first line and `随时分享。` on the second line.
- At desktop widths, the existing hero stays on the left and the three feature cards form a vertical column on the right.
- At narrow widths, the page must return to a readable single-column layout.
- Visitors may choose 1–3 hours and see `未登录用户仅限 3 小时`.
- Signed-in users may choose 1–24 hours and see `登录用户最长可保留 24 小时`.
- The space field label is `上传到空间` and its placeholder is `空间ID`.
- Do not add an upload endpoint, duplicate the upload workflow, change the database, or weaken server-side permission checks.
- Follow test-driven development: every behavior change must be observed failing before implementation.

---

## File Map

- `web/src/pages/HomePage.tsx`: homepage content structure and forced two-line heading.
- `web/src/pages/HomePage.test.tsx`: homepage heading and structural behavior.
- `web/src/pages/UploadPage.tsx`: login-aware retention limit, clamped input, and field copy.
- `web/src/pages/UploadPage.test.tsx`: visitor and signed-in retention behavior plus space field copy.
- `web/src/styles.css`: desktop homepage grid, narrow-screen fallback, and retention note colors.

### Task 1: Desktop Homepage First-Screen Layout

**Files:**
- Modify: `web/src/pages/HomePage.test.tsx`
- Modify: `web/src/pages/HomePage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: the existing `HomePage` route and the existing `.home-hero`, `.home-features`, and `.deploy-card` elements.
- Produces: two `.home-title-line` spans inside the heading and a desktop grid where `.home-hero` and `.home-features` are sibling columns.

- [ ] **Step 1: Write the failing homepage tests**

Add assertions to the existing homepage test:

```tsx
const heading = main.getByRole("heading", {
  name: "随时部署，随时分享。",
});
expect(within(heading).getByText("随时部署，")).toHaveClass("home-title-line");
expect(within(heading).getByText("随时分享。")).toHaveClass("home-title-line");

const page = heading.closest(".home-page");
expect(page?.querySelector(":scope > .home-hero")).toBeInTheDocument();
expect(page?.querySelector(":scope > .home-features")).toBeInTheDocument();
```

- [ ] **Step 2: Run the homepage test and verify RED**

Run:

```bash
cd web
npm test -- src/pages/HomePage.test.tsx
```

Expected: FAIL because the heading does not contain `.home-title-line` elements.

- [ ] **Step 3: Add the minimum heading markup**

Replace the current heading with:

```tsx
<h1>
  <span className="home-title-line">随时部署，</span>
  <span className="home-title-line">随时分享。</span>
</h1>
```

- [ ] **Step 4: Implement the approved desktop layout**

Update the existing homepage rules in `web/src/styles.css` so the outer page controls the two-column structure:

```css
.home-page {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.62fr);
  align-items: stretch;
  gap: 18px;
  padding: clamp(18px, 3vw, 36px) 0 40px;
}

.home-hero {
  grid-template-columns: minmax(0, 1.08fr) minmax(250px, 0.92fr);
  gap: clamp(24px, 3vw, 40px);
  padding: clamp(30px, 4vw, 52px);
}

.home-title-line {
  display: block;
}

.home-features {
  grid-template-columns: 1fr;
  grid-template-rows: repeat(3, 1fr);
  gap: 14px;
}

.home-features article {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 22px;
}
```

Add the narrow-screen fallback:

```css
@media (max-width: 900px) {
  .home-page {
    grid-template-columns: 1fr;
  }
}
```

Keep the existing mobile `.home-hero` single-column rule.

- [ ] **Step 5: Run the homepage test and verify GREEN**

Run:

```bash
cd web
npm test -- src/pages/HomePage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the homepage task**

```bash
git add web/src/pages/HomePage.test.tsx web/src/pages/HomePage.tsx web/src/styles.css
git commit -m "Refine desktop homepage first-screen layout"
```

### Task 2: Login-Aware Upload Retention Fields

**Files:**
- Modify: `web/src/pages/UploadPage.test.tsx`
- Modify: `web/src/pages/UploadPage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `getCurrentUser(): CurrentUser | null` from `web/src/auth.ts`.
- Produces: `maxDurationHours` with value `3` for visitors or `24` for signed-in users, and a controlled `durationHours` input clamped to `1..maxDurationHours`.

- [ ] **Step 1: Write the failing visitor test**

Add:

```tsx
it("limits visitors to three hours and labels the space field", () => {
  render(<UploadPage />);

  const duration = screen.getByRole("spinbutton", { name: "链接保留时长" });
  expect(duration).toHaveAttribute("min", "1");
  expect(duration).toHaveAttribute("max", "3");
  expect(screen.getByText("未登录用户仅限 3 小时")).toHaveClass(
    "retention-note--visitor",
  );

  fireEvent.change(duration, { target: { value: "8" } });
  expect(duration).toHaveValue(3);

  expect(screen.getByRole("textbox", { name: "上传到空间" })).toHaveAttribute(
    "placeholder",
    "空间ID",
  );
});
```

- [ ] **Step 2: Run the upload test and verify visitor RED**

Run:

```bash
cd web
npm test -- src/pages/UploadPage.test.tsx
```

Expected: FAIL because the new labels, visitor maximum, note, and placeholder do not exist.

- [ ] **Step 3: Write the signed-in test while production code is still RED**

Add:

```tsx
it("allows signed-in users up to twenty-four hours", () => {
  localStorage.setItem("user", JSON.stringify({
    id: "u2",
    username: "member",
    role: "USER",
  }));

  render(<UploadPage />);

  const duration = screen.getByRole("spinbutton", { name: "链接保留时长" });
  expect(duration).toHaveAttribute("max", "24");
  expect(screen.getByText("登录用户最长可保留 24 小时")).toBeInTheDocument();

  fireEvent.change(duration, { target: { value: "30" } });
  expect(duration).toHaveValue(24);
});
```

Extend `afterEach` with `localStorage.clear()` so the two states remain isolated.

- [ ] **Step 4: Implement the minimum login-aware limit**

Import the existing authentication helper:

```tsx
import { getCurrentUser } from "../auth";
```

Inside `UploadPage`, derive the limit:

```tsx
const isLoggedIn = getCurrentUser() !== null;
const maxDurationHours = isLoggedIn ? 24 : 3;
```

Replace the two field labels with:

```tsx
<label>
  链接保留时长
  <span
    className={
      isLoggedIn
        ? "retention-note retention-note--user"
        : "retention-note retention-note--visitor"
    }
  >
    {isLoggedIn ? "登录用户最长可保留 24 小时" : "未登录用户仅限 3 小时"}
  </span>
  <input
    type="number"
    min={1}
    max={maxDurationHours}
    value={durationHours}
    onChange={(event) => {
      const nextValue = Number(event.target.value);
      setDurationHours(Math.min(maxDurationHours, Math.max(1, nextValue)));
    }}
  />
</label>
<label>
  上传到空间
  <input
    value={spaceId}
    placeholder="空间ID"
    onChange={(event) => setSpaceId(event.target.value)}
  />
</label>
```

- [ ] **Step 5: Add the retention note colors**

Add:

```css
.retention-note {
  font-size: 13px;
  font-weight: 700;
}

.retention-note--visitor {
  color: #c2410c;
}

.retention-note--user {
  color: #2563eb;
}
```

- [ ] **Step 6: Run the upload test and verify GREEN**

Run:

```bash
cd web
npm test -- src/pages/UploadPage.test.tsx
```

Expected: PASS, including the existing shared-dropzone and endpoint tests.

- [ ] **Step 7: Commit the upload task**

```bash
git add web/src/pages/UploadPage.test.tsx web/src/pages/UploadPage.tsx web/src/styles.css
git commit -m "Clarify upload retention limits"
```

### Task 3: Full Frontend Verification

**Files:**
- Verify only; no production files should change.

**Interfaces:**
- Consumes: the completed homepage and upload-page changes.
- Produces: test, type-check, build, and desktop visual evidence.

- [ ] **Step 1: Run the complete frontend test suite**

Run:

```bash
cd web
npm test
```

Expected: all test files and tests PASS with no warnings.

- [ ] **Step 2: Run type checking**

Run:

```bash
cd web
npm run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Build the frontend**

Run:

```bash
cd web
npm run build
```

Expected: exit code 0 and a fresh `web/dist`.

- [ ] **Step 4: Check the pages at desktop size**

Run the local site and inspect `/` and `/upload` at a desktop viewport. Confirm:

- the Slogan is exactly two lines;
- the hero is left of three vertically stacked feature cards;
- the whole homepage content fits without vertical scrolling at a common desktop height;
- the upload page shows the correct note and maximum for both visitor and signed-in states;
- no browser console errors occur.

- [ ] **Step 5: Confirm the worktree contains only intended changes**

Run:

```bash
git status -sb
git diff --check
```

Expected: no temporary preview files, generated output, credentials, databases, uploads, or unrelated changes are staged or committed.
