# Work updates and space administrators implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the tasks. Steps use checkbox syntax for tracking.

**Goal:** 更新作品保留网址和信息，空间管理员可回退上一版、续期和协作管理，创建者可授权贡献者。
**Architecture:** 新增空间授权表，权限检查集中到 space-permissions；版本更新只原子切换目录引用，保留空间作品上一版。贡献者按现存作品汇总。前端复用卡片菜单与上传组件，提供右侧贡献者浮层。
**Tech Stack:** Existing Express/Prisma/MySQL, React/TypeScript, Vitest; no dependency upgrades.
**Spec:** ../specs/2026-10-27-work-updates-space-admins-design.md (用户已于 2026-10-27 确认)

## Global constraints
- Only the creator grants/revokes administrators; no member add/remove UI or API.
- Existing site administrators may update files; rollback requires creator/delegated space admin.
- Preserve IDs, slugs, viewCount, tags, owners, timestamps, expiry and visibility.
- Production migration requires separate explicit approval; prepare and validate locally first.
- Existing production .env/storage/dependencies remain protected.

## Review focus
- Revoke during upload, concurrent updates and delete races must not overwrite a newer state.
- Failed uploads retain the original work and clean staged files.
- Rollback and cleanup must handle both file roots; merge copies must not share removable directories.
- Anonymous contributors expose counts only; no private contact or device information.
- Delegated admins cannot grant roles, delete or merge spaces, or access another space.

## Task 1: schema, contributor API and reusable permissions
**Files:** schema.prisma; additive migration; space-permissions.ts; space-contributors.ts; routes.spaces.ts; space-tags.ts; space-downloads.ts; routes.deployments.ts.
**Interfaces:** canManageSpace(space,userId,db=prisma):Promise<boolean>; GET /spaces/:id/contributors -> {contributors:[{userId:string|null,username,workCount,role:'creator'|'admin'|'contributor'}]}; GET /spaces/:id/permissions -> {canManage,canManageAdmins,isOwner}; PUT /spaces/:id/administrators/:userId body {enabled:boolean}, creator only, grants only existing registered contributors.
- [x] Write failing permission/contributor tests, run RED.
- [x] Add SpaceAdministrator relation and Deployment.previousRootPath nullable column; generate client without upgrading dependencies.
- [x] Implement endpoints and apply delegate checks to work edits, tags, downloads, batch uploads, detail, list and renewal. Leave deletion/merge owner-only.
- [x] Run focused GREEN and backend build.

## Task 2: file revision lifecycle
**Files:** deployment-versions.ts; routes.deployments.ts; routes.preview.ts; storage.ts; cleanup.ts; admin-deletion.ts; space-tags.ts; space-merge.ts.
**Interfaces:** POST /deployments/:id/files multipart files[]/paths[], only uploader/space manager/site admin; POST /deployments/:id/rollback, creator/space manager only; success {id,publicSlug,hasPreviousVersion}. List/detail/public work payloads include hasPreviousVersion and ownerUserId as needed.
- [x] Write failing tests for original metadata preservation, rollback authorization, failed staging and CAS conflicts.
- [x] Stage independent roots, recheck permission at commit, compare-and-set current+previous roots; swap on rollback. Keep previous for space works, delete obsolete versions after success.
- [x] Clean both roots on deletion/expiry; copy/move previous roots and admin grants during space merges. Ensure preview resources revalidate.
- [x] Run GREEN, storage/lifecycle regression and backend build.

## Task 3: frontend integration (independent of backend implementation, bound to interfaces above)
**Files:** WorkVersionActions.tsx; SpaceContributors.tsx; WorkActionIcon.tsx; WorkPreviewCard.tsx; types.ts; DashboardPage.tsx; SpaceEntryPage.tsx; SpacePage.tsx; AdminPage.tsx; styles.css; related tests.
**Contracts:** Space list/detail includes isOwner:boolean and canManage:boolean; works include hasPreviousVersion:boolean, canUpdate:boolean, canRollback:boolean when requester is known (public entry permissions endpoint is authoritative for managers). Admin lists expose ownerUserId and server-calculated capability flags.
- [x] Write failing UI tests for permission-visible actions, required confirmation, contributor grant/revoke and no member deletion.
- [x] Implement single HTML/folder replacement modal and rollback confirmation, update preview on success without changing share URLs.
- [x] Add contributor drawer/public space and management views, creator-only role controls; delegate space navigation and renewal; hide creator-only deletion/merge/name editing where required.
- [x] Run frontend focused tests, typecheck/build and browser checks when possible.

## Task 4: acceptance and release preparation
- [x] Run complete relevant server/frontend suites and required builds; inspect additive migration SQL and schema validation.
- [x] Fresh-context whole-branch review; fix important findings with regression tests.
- [x] Commit and synchronize a reviewable PR, include exact migration and rollback steps; clean temporary artifacts.
- [x] Ask explicit approval for production migration with the completed SQL, checks and backup plan; do not migrate/deploy before approval.

## Execution ledger — 2026-10-27

- Tasks 1–3 implemented. Prisma client generated using existing 6.19.2; no dependencies upgraded or database migrations run.
- Backend full suite: 27 files / 192 tests passed; frontend full suite: 20 files / 115 tests passed. Backend build, frontend typecheck/build, and schema validation passed.
- Real temporary-file tests verify two retained versions, rollback, obsolete-version cleanup and unchanged metadata/viewCount. Merge test verifies independent previous-version copy and inherited grants.
- Review findings fixed: cleanup/renewal share a space lock and recheck expiry; permanent deletion tombstones in a short transaction before removing files outside it; API responses strip paths and upload metadata. Fresh reviewer rechecked and reported no remaining blockers.
- Ruling: failed permanent file cleanup retains a tombstoned work/expired space for retry, so failed cleanup never permits staged version commits. This replaces filesystem operations inside potentially slow interactive transactions.
- Local browser acceptance uses actual compiled routes and file storage with an in-memory database and fictional accounts only. Update submission, rollback, required confirmations, contributor drawer and approved fictional administrator grant checked; production SQL behavior remains untested until separately approved migration.
- Fixture folder initially hid previews because Express ignores dot directories; moved fixture storage to a normal temporary directory. Product routing was not changed for the fixture issue.
- Production read-only disk check: 1.6 GB free, current storage 1.5 GB. No production files, roles, schema or settings changed. Backups must use verified deduplication or off-server storage before release; no old backups may be silently deleted.
- Task 4: implementation committed and pushed; PR https://github.com/fffuuufffuuu/Drop-Share/pull/12 merged after the user explicitly requested deployment. Temporary fixture service and files removed. Full verified backups preceded the successful production migration and publish; original business record digests match. See docs/2026-10-27-space-admins-release.md for actual release evidence.
