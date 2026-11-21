import express from "express";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { config } from "./config";
import { prisma } from "./db";
import { isSlugReusableDuringMerge, mergeAvailabilityHandler, mergeSpacesHandler, sourceTagNames } from "./space-merge";

vi.mock("./db", () => ({
  prisma: {
    space: { findMany: vi.fn(), findUnique: vi.fn() },
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

function availabilityApp() {
  const server = express();
  server.use(express.json());
  server.post("/availability", (req, _res, next) => {
    req.authUser = { userId: "owner", username: "tester" };
    next();
  }, mergeAvailabilityHandler);
  server.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: error.message });
  });
  return server;
}

describe("space merge", () => {
  let tempRoot = "";
  let tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    spaceAdministrator:{findMany:ReturnType<typeof vi.fn>;createMany:ReturnType<typeof vi.fn>};
    space: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
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
      $queryRaw:vi.fn(),
      spaceAdministrator:{findMany:vi.fn().mockResolvedValue([]),createMany:vi.fn()},
      space: {
        findMany: vi.fn().mockResolvedValue(sourceSpaces),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => data),
        update: vi.fn().mockImplementation(async ({ data }) => data),
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
    const previousRoot=path.join(tempRoot,"previous");await mkdir(previousRoot);await writeFile(path.join(previousRoot,"index.html"),"previous page");
    await mkdir(sourceRoot);
    await writeFile(path.join(sourceRoot, "index.html"), "original page");
    const original = {
      id: "work-1", spaceId: "first", rootPath: sourceRoot, previousRootPath:previousRoot,title: "轨道演示",
      ownerUserId: "uploader", visibility: "hidden", uploaderIp: null, uploaderAgent: null,
      createdAt: new Date("2026-01-01"), tags: [{ tag: { name: "课件" } }],
    };
    vi.mocked(prisma.space.findMany).mockResolvedValue(sourceSpaces as never);
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([original] as never);
    tx.deployment.findMany.mockResolvedValue([{ id: "work-1",rootPath:sourceRoot,previousRootPath:previousRoot }]);
    tx.spaceAdministrator.findMany.mockResolvedValue([{userId:"delegate"},{userId:"delegate"}]);
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
    expect(copy.previousRootPath).not.toBe(previousRoot);
    expect(await readFile(path.join(copy.previousRootPath,"index.html"),"utf8")).toBe("previous page");
    expect(tx.spaceAdministrator.createMany).toHaveBeenCalledWith({data:[{spaceId:response.body.id,userId:"delegate"}],skipDuplicates:true});
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
    tx.deployment.findMany.mockResolvedValue([{ id: "work-1",rootPath:sourceRoot,previousRootPath:null }]);
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

  it("merges three spaces, tags works by source, and keeps the latest expiry", async () => {
    const third = { id: "third", name: "生物", slug: "biology", ownerUserId: "owner", expiresAt: new Date("2099-03-01") };
    const sources = [...sourceSpaces, third];
    tx.space.findMany.mockResolvedValue(sources);
    tx.deployment.findMany.mockResolvedValue([
      { id: "d1", spaceId: "first", tags: [] },
      { id: "d2", spaceId: "second", tags: [] },
      { id: "d3", spaceId: "third", tags: [] },
    ]);
    const response = await request(app()).post("/merge").send({
      sourceIds: ["first", "second", "third"], name: "科学", slug: "science", sourceDisposition: "remove",
    });
    expect(response.status).toBe(201);
    expect(tx.space.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      name: "科学", ownerUserId: "owner", expiresAt: third.expiresAt, slug: "science",
    }) });
    expect(tx.spaceTag.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ name: "物理" }),
      expect.objectContaining({ name: "化学" }),
      expect.objectContaining({ name: "生物" }),
    ]) });
    expect(tx.deployment.updateMany).toHaveBeenCalledTimes(3);
    expect(tx.space.delete).toHaveBeenCalledTimes(3);
  });

  it("copies works from three spaces when originals are kept", async () => {
    const third = { id: "third", name: "生物", slug: "biology", ownerUserId: "owner", expiresAt: new Date("2099-03-01") };
    const sources = [...sourceSpaces, third];
    const sourceRoot = path.join(tempRoot, "original");
    await mkdir(sourceRoot);
    await writeFile(path.join(sourceRoot, "index.html"), "original page");
    vi.mocked(prisma.space.findMany).mockResolvedValue(sources as never);
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([
      {
        id: "work-1", spaceId: "first", rootPath: sourceRoot, previousRootPath: null, title: "轨道演示",
        ownerUserId: "uploader", visibility: "visible", uploaderIp: null, uploaderAgent: null,
        createdAt: new Date("2026-01-01"), tags: [],
      },
      {
        id: "work-2", spaceId: "third", rootPath: sourceRoot, previousRootPath: null, title: "细胞",
        ownerUserId: "uploader", visibility: "visible", uploaderIp: null, uploaderAgent: null,
        createdAt: new Date("2026-01-02"), tags: [],
      },
    ] as never);
    tx.space.findMany.mockResolvedValue(sources);
    tx.deployment.findMany.mockResolvedValue([
      { id: "work-1", rootPath: sourceRoot, previousRootPath: null },
      { id: "work-2", rootPath: sourceRoot, previousRootPath: null },
    ]);

    const response = await request(app()).post("/merge").send({
      sourceIds: ["first", "second", "third"], name: "科学", sourceDisposition: "keep",
    });
    expect(response.status).toBe(201);
    expect(tx.space.delete).not.toHaveBeenCalled();
    expect(tx.deployment.createMany).toHaveBeenCalledTimes(2);
    const copiedIds = tx.deployment.createMany.mock.calls.flatMap(([arg]) => arg.data.map((item: { title: string }) => item.title));
    expect(copiedIds).toEqual(["轨道演示", "细胞"]);
  });

  it("lets a removed source donate its suffix to the new space", async () => {
    const response = await request(app()).post("/merge").send({
      sourceIds: ["first", "second"], name: "物理", slug: "physics", sourceDisposition: "remove",
    });
    expect(response.status).toBe(201);
    expect(tx.space.update).toHaveBeenCalledWith({
      where: { id: "first" },
      data: { slug: expect.stringMatching(/^[a-z0-9-]{2,40}$/) },
    });
    expect(tx.space.create).toHaveBeenCalledWith({ data: expect.objectContaining({ slug: "physics" }) });
    expect(response.body.slug).toBe("physics");
  });

  it("rejects a requested suffix that is still used when originals are kept", async () => {
    vi.mocked(prisma.space.findMany).mockResolvedValue(sourceSpaces as never);
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([] as never);
    const response = await request(app()).post("/merge").send({
      sourceIds: ["first", "second"], name: "物理", slug: "physics", sourceDisposition: "keep",
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: "该网址后缀已被使用，请修改后再合并" });
    expect(tx.space.update).not.toHaveBeenCalled();
    expect(tx.space.create).not.toHaveBeenCalled();
  });

  it("rejects a suffix already used by a space that is not being removed", async () => {
    tx.space.findUnique.mockResolvedValue({ id: "someone-else" });
    const response = await request(app()).post("/merge").send({
      sourceIds: ["first", "second"], name: "科学", slug: "taken", sourceDisposition: "remove",
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: "该网址后缀已被使用，请修改后再合并",
    });
    expect(tx.space.create).not.toHaveBeenCalled();
  });

  it("reports whether a merge suffix can be reused before confirmation", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({ id: "first" } as never);
    const reusable = await request(availabilityApp()).post("/availability").send({
      sourceIds: ["first", "second"], name: "科学", slug: "physics", sourceDisposition: "remove",
    });
    expect(reusable.status).toBe(200);
    expect(reusable.body).toEqual({ ok: true });

    const kept = await request(availabilityApp()).post("/availability").send({
      sourceIds: ["first", "second"], name: "科学", slug: "physics", sourceDisposition: "keep",
    });
    expect(kept.status).toBe(409);
    expect(kept.body).toEqual({
      message: "该网址后缀已被使用，请修改后再合并",
      errors: { slug: "该网址后缀已被使用，请修改后再合并" },
    });

    vi.mocked(prisma.space.findUnique).mockResolvedValue(null as never);
    const free = await request(availabilityApp()).post("/availability").send({
      sourceIds: ["first", "second"], name: "科学", slug: "science", sourceDisposition: "keep",
    });
    expect(free.status).toBe(200);
    expect(free.body).toEqual({ ok: true });
  });

  it("treats space names as format-only and does not invent name uniqueness", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(null as never);
    const response = await request(availabilityApp()).post("/availability").send({
      sourceIds: ["first", "second"], name: "物理", sourceDisposition: "remove",
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const invalid = await request(availabilityApp()).post("/availability").send({
      sourceIds: ["first", "second"], name: "   ", slug: "science", sourceDisposition: "remove",
    });
    expect(invalid.status).toBe(409);
    expect(invalid.body.errors.name).toMatch(/新空间名称须为 1 至 80 个字/);
  });

  it("decides suffix reuse from the original-space disposition", () => {
    expect(isSlugReusableDuringMerge(undefined, ["first"], "keep")).toBe(true);
    expect(isSlugReusableDuringMerge("first", ["first", "second"], "remove")).toBe(true);
    expect(isSlugReusableDuringMerge("first", ["first", "second"], "keep")).toBe(false);
    expect(isSlugReusableDuringMerge("other", ["first", "second"], "remove")).toBe(false);
  });

  it("rejects a single space or duplicate source ids", async () => {
    const single = await request(app()).post("/merge").send({
      sourceIds: ["first"], name: "科学", sourceDisposition: "remove",
    });
    expect(single.status).toBe(400);
    const duplicates = await request(app()).post("/merge").send({
      sourceIds: ["first", "first"], name: "科学", sourceDisposition: "remove",
    });
    expect(duplicates.status).toBe(400);
    expect(tx.space.create).not.toHaveBeenCalled();
  });

  it("disambiguates identical source names with slugs", () => {
    expect(sourceTagNames([
      { name: "物理", slug: "physics" },
      { name: "物理", slug: "physics-2" },
      { name: "化学", slug: "chemistry" },
    ])).toEqual(["物理 (physics)", "物理 (physics-2)", "化学"]);
  });
});
