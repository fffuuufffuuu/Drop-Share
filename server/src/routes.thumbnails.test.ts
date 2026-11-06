import express from "express";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { thumbnailRouter } from "./routes.thumbnails";
import { ThumbnailCache } from "./thumbnails";
const state = vi.hoisted(() => ({ work: null as any, spaceAdmin: false, siteAdmin: false }));
vi.mock("./db", () => ({ prisma: { deployment: { findUnique: async () => state.work }, spaceAdministrator: { findUnique: async () => state.spaceAdmin ? { userId: "member" } : null }, user: { findUnique: async () => ({ role: state.siteAdmin ? "ADMIN" : "USER" }) } } }));
vi.mock("./middleware", () => ({ requireAuth: (req: any, res: any, next: any) => { if (!req.headers.authorization) return res.status(401).end(); req.authUser = { userId: req.headers.authorization }; next(); } }));
vi.mock("./config", () => ({ config: { baseUrl: "http://localhost:4000", uploadRoot: "unused-thumbnail-root" } }));
let root: string;
const app = express().use("/api/previews", thumbnailRouter);
beforeEach(async () => {
  state.spaceAdmin = false; state.siteAdmin = false;
  root = await fs.mkdtemp(path.join(os.tmpdir(), "thumbnail-route-"));
  await fs.writeFile(path.join(root, "index.html"), "<h1>Work</h1>");
  state.work = { id: "d1", rootPath: root, visibility: "visible", deletedAt: null, expiresAt: new Date("2099-01-01"), space: null };
});

it.each(["uploader", "creator", "space-admin", "site-admin"])("allows %s to read a hidden cached thumbnail privately", async actor => {
  state.work.visibility = "hidden"; state.work.ownerUserId = "uploader";
  state.work.space = { id: "s1", ownerUserId: "creator", expiresAt: new Date("2099-01-01") };
  state.spaceAdmin = actor === "space-admin"; state.siteAdmin = actor === "site-admin";
  const file = path.join(root, "private.webp"); await fs.writeFile(file, "cached image");
  vi.spyOn(ThumbnailCache.prototype, "file").mockReturnValue(file);
  const render = vi.spyOn(ThumbnailCache.prototype, "request");
  const response = await request(app).get("/api/previews/demo/thumbnail/private").set("Authorization", actor);
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.headers["vary"]).toContain("Authorization");
  expect(response.headers["content-type"]).toContain("image/webp");
  expect(render).not.toHaveBeenCalled();
  expect((await request(app).get("/api/previews/demo/thumbnail/image?version=any")).status).toBe(404);
});
it("denies unauthorized, expired and deleted private thumbnails even when a cache exists", async () => {
  state.work.visibility = "hidden"; state.work.ownerUserId = "uploader";
  const file = path.join(root, "cached.webp"); await fs.writeFile(file, "cached"); vi.spyOn(ThumbnailCache.prototype, "file").mockReturnValue(file);
  expect((await request(app).get("/api/previews/demo/thumbnail/private")).status).toBe(401);
  expect((await request(app).get("/api/previews/demo/thumbnail/private").set("Authorization", "other")).status).toBe(404);
  state.work.expiresAt = new Date("2000-01-01");
  expect((await request(app).get("/api/previews/demo/thumbnail/private").set("Authorization", "uploader")).status).toBe(404);
  state.work.expiresAt = new Date("2099-01-01"); state.work.deletedAt = new Date();
  expect((await request(app).get("/api/previews/demo/thumbnail/private").set("Authorization", "uploader")).status).toBe(404);
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });
it("returns pending without waiting for a browser and does not accept a visitor-supplied render URL", async () => {
  const render = vi.spyOn(ThumbnailCache.prototype, "request").mockResolvedValue({ status: "pending" });
  const response = await request(app).get("/api/previews/demo/thumbnail?url=http://127.0.0.1/admin");
  expect(response.status).toBe(202);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(render.mock.calls[0][2]).toMatch(/\/p\/demo\/\?preview=1$/);
});
it("revalidates visibility before serving metadata or an image", async () => {
  const render = vi.spyOn(ThumbnailCache.prototype, "request");
  state.work.visibility = "hidden";
  expect((await request(app).get("/api/previews/demo/thumbnail")).status).toBe(404);
  expect((await request(app).get("/api/previews/demo/thumbnail/image?version=any")).status).toBe(404);
  expect(render).not.toHaveBeenCalled();
});
it("changes the cache version when the work changes and rejects old image URLs", async () => {
  vi.spyOn(ThumbnailCache.prototype, "request").mockResolvedValue({ status: "ready", file: "unused" });
  const first = await request(app).get("/api/previews/demo/thumbnail");
  expect(first.status).toBe(200);
  await fs.writeFile(path.join(root, "index.html"), "<h1>Updated work</h1>");
  const second = await request(app).get("/api/previews/demo/thumbnail");
  expect(second.body.version).not.toBe(first.body.version);
  expect((await request(app).get(`/api/previews/demo/thumbnail/image?version=${first.body.version}`)).status).toBe(409);
});

it("serves compressed WebP with revalidation from the private dot-prefixed cache directory", async () => {
  vi.spyOn(ThumbnailCache.prototype, "request").mockResolvedValue({ status: "ready", file: "unused" });
  const directory = path.join(root, ".thumbnails"); await fs.mkdir(directory);
  const file = path.join(directory, "preview.webp");
  const sharp = (await import("sharp")).default;
  await sharp({create:{width:4,height:4,channels:3,background:"white"}}).webp().toFile(file);
  vi.spyOn(ThumbnailCache.prototype, "file").mockReturnValue(file);
  const metadata = await request(app).get("/api/previews/demo/thumbnail");
  const image = await request(app).get(`/api/previews/demo/thumbnail/image?version=${metadata.body.version}`);
  expect(image.status).toBe(200);
  expect(image.headers["content-type"]).toContain("image/webp");
  expect(image.headers["etag"]).toBe(`"webp-v1-${metadata.body.version}"`);
  expect((await request(app).get(`/api/previews/demo/thumbnail/image?version=${metadata.body.version}`)
    .set("If-None-Match", image.headers["etag"])).status).toBe(304);
});
