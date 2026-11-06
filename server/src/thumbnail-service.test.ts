import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { backfillThumbnails, prepareThumbnail, readyThumbnailVersion, thumbnailCache } from "./thumbnail-service";
import { prisma } from "./db";
const state = vi.hoisted(() => ({ work: null as any }));
vi.mock("./config", () => ({ config: { baseUrl: "https://example.com", uploadRoot: "unused-thumbnail-root" } }));
vi.mock("./db", () => ({ prisma: { deployment: { findUnique: vi.fn(async () => state.work), findMany: vi.fn() } } }));
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "thumbnail-service-"));
  await fs.writeFile(path.join(root, "index.html"), "<h1>Work</h1>");
  state.work = { id: "a", publicSlug: "demo", rootPath: root, visibility: "visible", deletedAt: null, expiresAt: new Date("2099-01-01"), space: null };
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true, maxRetries: 3 }); });
it("prepares only available works and validates the latest version before publication", async () => {
  const request = vi.spyOn(thumbnailCache, "request").mockResolvedValue({ status: "pending" });
  state.work.visibility = "hidden";
  expect(await prepareThumbnail("demo")).toEqual({ status: "unavailable" });
  state.work.visibility = "visible"; state.work.space = { expiresAt: new Date("2000-01-01") };
  await prepareThumbnail("demo"); expect(request).not.toHaveBeenCalled();
  state.work.space = null;
  await prepareThumbnail("demo");
  expect(request).toHaveBeenCalledWith("a", expect.any(String), "https://example.com/p/demo/?preview=1", expect.any(Function));
  const validate = request.mock.calls[0][3]!;
  expect(await validate()).toBe(true);
  await fs.writeFile(path.join(root, "index.html"), "changed source");
  expect(await validate()).toBe(false);
});
it("exposes a cached version only when its image exists and the work is public", async () => {
  const file = path.join(root, "ready.webp");
  vi.spyOn(thumbnailCache, "file").mockReturnValue(file);
  expect(await readyThumbnailVersion(state.work)).toBeUndefined();
  await fs.writeFile(file, "cached");
  expect(await readyThumbnailVersion(state.work)).toMatch(/^[a-f0-9]{24}$/);
  state.work.deletedAt = new Date();
  expect(await readyThumbnailVersion(state.work)).toBeUndefined();
});
it("backfills paginated works with queue backpressure rather than flooding the browser", async () => {
  vi.mocked(prisma.deployment.findMany).mockResolvedValueOnce([{ id: "a", publicSlug: "first" }] as never)
    .mockResolvedValueOnce([{ id: "b", publicSlug: "second" }] as never).mockResolvedValueOnce([]);
  const events: string[] = [];
  vi.spyOn(thumbnailCache, "request").mockImplementation(async (_id, _version, url) => { events.push(new URL(url).pathname); return { status: "pending" }; });
  vi.spyOn(thumbnailCache, "idle").mockImplementation(async () => { events.push("drain"); });
  await backfillThumbnails();
  expect(events).toEqual(["/p/first/", "drain", "/p/second/", "drain"]);
  expect(prisma.deployment.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ take: 50, cursor: { id: "a" }, skip: 1 }));
});
