import express from "express";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previewRouter } from "./routes.preview";

const state = vi.hoisted(() => ({ deployment: {} as any }));
vi.mock("./db", () => ({ prisma: { deployment: {
  findUnique: async () => state.deployment,
  update: async ({ data }: any) => {
    state.deployment.viewCount += data.viewCount.increment;
    return state.deployment;
  },
} } }));

let root: string;
function app() { return express().use(previewRouter); }

describe("work page views", () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "drop-share-views-"));
    await fs.writeFile(path.join(root, "index.html"), "<h1>Work</h1>");
    await fs.writeFile(path.join(root, "style.css"), "body { color: red }");
    state.deployment = { id: "work-1", rootPath: root, viewCount: 0,
      visibility: "visible", deletedAt: null, expiresAt: new Date("2099-01-01"), space: null };
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it("counts a direct visit and refresh, including explicit index.html", async () => {
    for (const url of ["/p/work/", "/p/work/", "/p/work/index.html"]) {
      const res = await request(app()).get(url).set("Sec-Fetch-Dest", "document");
      expect(res.status).toBe(200);
      expect(res.text).toContain("<h1>Work</h1>");
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    await vi.waitFor(() => expect(state.deployment.viewCount).toBe(3));
  });

  it("does not count iframe previews, assets, prefetches or HEAD", async () => {
    await request(app()).get("/p/work/").set("Sec-Fetch-Dest", "iframe");
    await request(app()).get("/p/work/?preview=1");
    await request(app()).get("/p/work/style.css");
    await request(app()).get("/p/work/missing.js");
    await request(app()).get("/p/work/").set("Sec-Purpose", "prefetch");
    await request(app()).head("/p/work/");
    expect(state.deployment.viewCount).toBe(0);
  });

  it("counts direct links without fetch metadata and SPA document routes", async () => {
    await request(app()).get("/p/work/");
    await request(app()).get("/p/work/lesson/1").set("Sec-Fetch-Dest", "document");
    await vi.waitFor(() => expect(state.deployment.viewCount).toBe(2));
  });

  it.each(["hidden", "deleted", "expired", "missing-file"])("does not count an unavailable work: %s", async (kind) => {
    if (kind === "hidden") state.deployment.visibility = "hidden";
    if (kind === "deleted") state.deployment.deletedAt = new Date();
    if (kind === "expired") state.deployment.expiresAt = new Date("2000-01-01");
    if (kind === "missing-file") await fs.unlink(path.join(root, "index.html"));
    const res = await request(app()).get("/p/work/");
    expect(res.status).toBe(404);
    expect(state.deployment.viewCount).toBe(0);
  });
});
