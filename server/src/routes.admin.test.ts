import express from "express";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { adminRouter } from "./routes.admin";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
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

function createApp() {
  const app = express();
  app.use("/api/admin", adminRouter);
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
});
