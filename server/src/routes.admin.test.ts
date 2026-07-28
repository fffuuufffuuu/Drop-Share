import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { adminRouter } from "./routes.admin";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      findMany: vi.fn(),
    },
    space: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

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
});
