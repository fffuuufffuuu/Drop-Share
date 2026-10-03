import express from "express";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { config } from "./config";
import { prisma } from "./db";
import { mergeSpacesHandler } from "./space-merge";

vi.mock("./db", () => ({
  prisma: {
    space: { findMany: vi.fn() },
    deployment: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const sourceSpaces = [
  { id: "first", name: "物理", slug: "physics", ownerUserId: "owner", expiresAt: new Date("2099-01-01") },
  { id: "second", name: "化学", slug: "chemistry", ownerUserId: "owner", expiresAt: new Date("2099-02-01") },
];

function app(admin = false) {
  const server = express();
  server.use(express.json());
  server.post("/merge", (req, _res, next) => {
    req.authUser = { userId: admin ? "admin" : "owner", username: "tester" };
    next();
  }, mergeSpacesHandler(admin));
  server.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: error.message });
  });
  return server;
}

describe("space merge", () => {
  let tempRoot = "";
  let tx: {
    space: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    spaceTag: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
    deploymentTag: { createMany: ReturnType<typeof vi.fn> };
    deployment: {
      findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await mkdtemp(path.join(tmpdir(), "drop-share-merge-"));
    config.uploadRoot = tempRoot;
    tx = {
      space: {
        findMany: vi.fn().mockResolvedValue(sourceSpaces),
        create: vi.fn().mockImplementation(async ({ data }) => data),
        delete: vi.fn().mockResolvedValue({}),
      },
      spaceTag: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      deploymentTag: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      deployment: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("marks works with their source space names and removes both original spaces", async () => {
    tx.deployment.findMany.mockResolvedValue([
      { id: "d1", spaceId: "first", tags: [] },
      { id: "d2", spaceId: "second", tags: [] },
    ]);
    const response = await request(app()).post("/merge").send({
      sourceIds: ["first", "second"], name: "科学", slug: "science", sourceDisposition: "remove",
    });
    expect(response.status).toBe(201);
    expect(response.body.slug).toBe("science");
    expect(tx.space.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      name: "科学", ownerUserId: "owner", expiresAt: sourceSpaces[1].expiresAt,
    }) });
    expect(tx.spaceTag.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ name: "物理" }),
      expect.objectContaining({ name: "化学" }),
    ]) });
    expect(tx.deployment.updateMany).toHaveBeenCalledWith({
      where: { spaceId: "first", deletedAt: null },
      data: expect.objectContaining({ spaceId: response.body.id }),
    });
    expect(tx.deployment.updateMany).toHaveBeenCalledWith({
      where: { spaceId: "second", deletedAt: null },
      data: expect.objectContaining({ spaceId: response.body.id }),
    });
    expect(tx.deploymentTag.createMany).toHaveBeenCalledTimes(2);
    expect(tx.space.delete).toHaveBeenCalledTimes(2);
    expect(tx.deployment.createMany).not.toHaveBeenCalled();
  });

  it("copies files for an independent new space while preserving the originals", async () => {
    const sourceRoot = path.join(tempRoot, "original");
    await mkdir(sourceRoot);
    await writeFile(path.join(sourceRoot, "index.html"), "original page");
    const original = {
      id: "work-1", spaceId: "first", rootPath: sourceRoot, title: "轨道演示",
      ownerUserId: "uploader", visibility: "hidden", uploaderIp: null, uploaderAgent: null,
      createdAt: new Date("2026-01-01"), tags: [{ tag: { name: "课件" } }],
    };
    vi.mocked(prisma.space.findMany).mockResolvedValue(sourceSpaces as never);
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([original] as never);
    tx.deployment.findMany.mockResolvedValue([{ id: "work-1" }]);
    tx.spaceTag.findMany.mockResolvedValue([{ id: "old-tag", name: "课件", spaceId: "first" }]);

    const response = await request(app()).post("/merge").send({
      sourceIds: ["first", "second"], name: "科学", sourceDisposition: "keep",
    });
    expect(response.status).toBe(201);
    expect(tx.space.delete).not.toHaveBeenCalled();
    expect(tx.deployment.updateMany).not.toHaveBeenCalled();
    const copy = tx.deployment.createMany.mock.calls[0][0].data[0];
    expect(copy).toMatchObject({
      title: "轨道演示", ownerUserId: "uploader", visibility: "hidden",
      spaceId: response.body.id,
    });
    expect(tx.spaceTag.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ name: "物理" }), expect.objectContaining({ name: "课件" }),
    ]) });
    expect(tx.deploymentTag.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ deploymentId: copy.id }),
    ]) });
    expect(copy.publicSlug).toBeTruthy();
    expect(copy.rootPath).not.toBe(sourceRoot);
    expect(await readFile(path.join(copy.rootPath, "index.html"), "utf8")).toBe("original page");
    expect(await readFile(path.join(sourceRoot, "index.html"), "utf8")).toBe("original page");
  });

  it("rejects different owners even for admins", async () => {
    tx.space.findMany.mockResolvedValue([
      sourceSpaces[0], { ...sourceSpaces[1], ownerUserId: "someone-else" },
    ]);
    const response = await request(app(true)).post("/merge").send({
      sourceIds: ["first", "second"], name: "科学", sourceDisposition: "remove",
    });
    expect(response.status).toBe(403);
    expect(tx.space.create).not.toHaveBeenCalled();
  });

  it("cleans up copied files if the database transaction fails", async () => {
    const sourceRoot = path.join(tempRoot, "original");
    await mkdir(sourceRoot);
    await writeFile(path.join(sourceRoot, "index.html"), "original page");
    vi.mocked(prisma.space.findMany).mockResolvedValue(sourceSpaces as never);
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([{
      id: "work-1", spaceId: "first", rootPath: sourceRoot, title: "轨道演示",
      ownerUserId: null, visibility: "visible", uploaderIp: null, uploaderAgent: null,
      createdAt: new Date("2026-01-01"), tags: [],
    }] as never);
    tx.deployment.findMany.mockResolvedValue([{ id: "work-1" }]);
    let createdRoot = "";
    tx.space.create.mockImplementation(async ({ data }) => {
      createdRoot = path.join(tempRoot, "spaces", data.id);
      throw new Error("database unavailable");
    });
    const response = await request(app()).post("/merge").send({
      sourceIds: ["first", "second"], name: "科学", sourceDisposition: "keep",
    });
    expect(response.status).toBe(500);
    await expect(access(createdRoot)).rejects.toThrow();
    expect(await readFile(path.join(sourceRoot, "index.html"), "utf8")).toBe("original page");
  });
});
