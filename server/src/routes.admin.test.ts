import express from "express";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import {
  permanentlyDeleteDeployment,
  permanentlyDeleteSpace,
} from "./admin-deletion";
import { adminRouter } from "./routes.admin";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    space: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const temporaryRoots: string[] = [];

async function createDeploymentRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "drop-share-route-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "index.html"), "<h1>首页</h1>");
  await writeFile(path.join(root, "assets", "app.js"), "console.log('ok')");
  return root;
}

vi.mock("./middleware", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.authUser = { userId: "admin-id", username: "fffuuu" };
    next();
  },
  requireAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock("./admin-deletion", () => ({
  permanentlyDeleteDeployment: vi.fn(),
  permanentlyDeleteSpace: vi.fn(),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ message: error.message });
  });
  return app;
}

describe("admin inventory routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("lists authenticated and anonymous personal deployments without private fields", async () => {
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([
      {
        id: "d1",
        title: "匿名作品",
        publicSlug: "public-one",
        visibility: "visible",
        createdAt: new Date("2026-07-29T01:00:00.000Z"),
        expiresAt: new Date("2026-07-30T01:00:00.000Z"),
        owner: null,
        rootPath: "C:/secret/path",
      },
      {
        id: "d2",
        title: "用户作品",
        publicSlug: "public-two",
        visibility: "hidden",
        createdAt: new Date("2026-07-28T01:00:00.000Z"),
        expiresAt: new Date("2026-07-31T01:00:00.000Z"),
        owner: { username: "owner" },
      },
    ] as never);

    const response = await request(createApp()).get("/api/admin/deployments/personal");

    expect(response.status).toBe(200);
    expect(prisma.deployment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { spaceId: null, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }));
    expect(response.body[0]).toMatchObject({
      id: "d1",
      ownerLabel: "匿名",
      publicSlug: "public-one",
    });
    expect(response.body[1].ownerLabel).toBe("owner");
    expect(response.body[0]).not.toHaveProperty("rootPath");
  });

  it("lists spaces with owner and active deployment count", async () => {
    vi.mocked(prisma.space.findMany).mockResolvedValue([
      {
        id: "s1",
        name: "作品空间",
        slug: "portfolio",
        createdAt: new Date("2026-07-29T01:00:00.000Z"),
        expiresAt: new Date("2027-07-30T01:00:00.000Z"),
        owner: { username: "owner" },
        _count: { deployments: 2 },
      },
    ] as never);

    const response = await request(createApp()).get("/api/admin/spaces");

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: "s1",
      deploymentCount: 2,
      ownerUsername: "owner",
      expiresAt: "2027-07-30T01:00:00.000Z",
    });
    expect(prisma.space.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: "desc" },
    }));
  });

  it("returns 404 for an unknown space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(null);

    const response = await request(createApp()).get("/api/admin/spaces/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "空间不存在或已被删除" });
  });

  it("returns a space with only its active deployments", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      id: "s1",
      name: "作品空间",
      slug: "portfolio",
      createdAt: new Date("2026-07-29T01:00:00.000Z"),
      expiresAt: new Date("2027-07-30T01:00:00.000Z"),
      owner: { username: "owner" },
      deployments: [
        {
          id: "d1",
          title: "首页",
          publicSlug: "home",
          visibility: "visible",
          createdAt: new Date("2026-07-29T02:00:00.000Z"),
          expiresAt: new Date("2027-07-29T02:00:00.000Z"),
          owner: { username: "owner" },
        },
      ],
    } as never);

    const response = await request(createApp()).get("/api/admin/spaces/s1");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: "s1",
      ownerUsername: "owner",
      expiresAt: "2027-07-30T01:00:00.000Z",
      deployments: [{ id: "d1", ownerLabel: "owner" }],
    });
    expect(prisma.space.findUnique).toHaveBeenCalledWith({
      where: { id: "s1" },
      select: expect.objectContaining({
        deployments: expect.objectContaining({
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        }),
      }),
    });
  });

  it("updates deployment visibility through the admin route", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1" } as never);
    vi.mocked(prisma.deployment.update).mockResolvedValue({
      id: "d1",
      visibility: "hidden",
    } as never);

    const response = await request(createApp())
      .patch("/api/admin/deployments/d1")
      .send({ visibility: "hidden" });

    expect(response.status).toBe(200);
    expect(prisma.deployment.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { visibility: "hidden" },
    });
    expect(response.body).toMatchObject({ id: "d1", visibility: "hidden" });
  });

  it("rejects an invalid administrator visibility value", async () => {
    const response = await request(createApp())
      .patch("/api/admin/deployments/d1")
      .send({ visibility: "archived" });

    expect(response.status).toBe(400);
    expect(prisma.deployment.update).not.toHaveBeenCalled();
  });

  it("returns 404 when an administrator changes a missing deployment", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue(null);

    const response = await request(createApp())
      .patch("/api/admin/deployments/missing")
      .send({ visibility: "hidden" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "网页不存在或已被删除" });
    expect(prisma.deployment.update).not.toHaveBeenCalled();
  });

  it("downloads a single deployment as a ZIP", async () => {
    const rootPath = await createDeploymentRoot();
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue({
      id: "d1",
      title: "首页",
      rootPath,
    } as never);

    const response = await request(createApp()).get("/api/admin/deployments/d1/download");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/zip/);
    expect(response.headers["content-disposition"]).toMatch(/\.zip/);
  });

  it("returns 404 when downloading an unknown deployment", async () => {
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);

    const response = await request(createApp()).get("/api/admin/deployments/missing/download");

    expect(response.status).toBe(404);
  });

  it("returns 409 when a deployment source folder is missing", async () => {
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue({
      id: "d1",
      title: "首页",
      rootPath: path.join(tmpdir(), `drop-share-missing-${Date.now()}`),
    } as never);

    const response = await request(createApp()).get("/api/admin/deployments/d1/download");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: "源文件已不存在" });
  });

  it("downloads a whole space as a ZIP", async () => {
    const firstRoot = await createDeploymentRoot();
    const secondRoot = await createDeploymentRoot();
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      id: "s1",
      name: "作品空间",
      deployments: [
        { title: "作品", rootPath: firstRoot },
        { title: "作品", rootPath: secondRoot },
      ],
    } as never);

    const response = await request(createApp()).get("/api/admin/spaces/s1/download");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/zip/);
    expect(response.headers["content-disposition"]).toMatch(/\.zip/);
  });

  it("permanently deletes a deployment", async () => {
    vi.mocked(permanentlyDeleteDeployment).mockResolvedValue("deleted");

    const response = await request(createApp()).delete("/api/admin/deployments/d1");

    expect(response.status).toBe(200);
    expect(permanentlyDeleteDeployment).toHaveBeenCalledWith("d1");
    expect(response.body).toEqual({ message: "网页已永久删除" });
  });

  it("returns 404 when deleting an unknown deployment", async () => {
    vi.mocked(permanentlyDeleteDeployment).mockResolvedValue("not-found");

    const response = await request(createApp()).delete("/api/admin/deployments/missing");

    expect(response.status).toBe(404);
  });

  it("passes deployment deletion failures to the error handler", async () => {
    vi.mocked(permanentlyDeleteDeployment).mockRejectedValue(new Error("磁盘清理失败"));

    const response = await request(createApp()).delete("/api/admin/deployments/d1");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "磁盘清理失败" });
  });

  it("permanently deletes a space", async () => {
    vi.mocked(permanentlyDeleteSpace).mockResolvedValue("deleted");

    const response = await request(createApp()).delete("/api/admin/spaces/s1");

    expect(response.status).toBe(200);
    expect(permanentlyDeleteSpace).toHaveBeenCalledWith("s1");
    expect(response.body).toEqual({ message: "空间已永久删除" });
  });
});
