import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { spaceRouter } from "./routes.spaces";
import { saveDeploymentFiles } from "./storage";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    space: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("./storage", () => ({
  saveDeploymentFiles: vi.fn(),
}));

vi.mock("./middleware", () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers.authorization) {
      res.status(401).json({ message: "Missing token" });
      return;
    }
    req.authUser = { userId: "user-1", username: "member" };
    next();
  },
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/spaces", spaceRouter);
  return app;
}

function authed(testRequest: request.Test) {
  return testRequest.set("Authorization", "Bearer user-token");
}

const now = new Date("2026-07-30T01:00:00.000Z");
const activeSpace = {
  id: "s1",
  ownerUserId: "user-1",
  name: "作品空间",
  slug: "portfolio",
  createdAt: new Date("2026-07-29T01:00:00.000Z"),
  expiresAt: new Date("2026-08-01T01:00:00.000Z"),
};

describe("space expiration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveDeploymentFiles).mockResolvedValue("storage/spaces/s1/d1");
    vi.mocked(prisma.deployment.create).mockResolvedValue({
      id: "d1",
      publicSlug: "public-work",
      expiresAt: activeSpace.expiresAt,
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["0", "366", "1.5"])(
    "rejects space durationDays=%s",
    async (durationDays) => {
      const response = await authed(request(createApp()).post("/api/spaces"))
        .send({ name: "作品空间", durationDays });

      expect(response.status).toBe(400);
      expect(prisma.space.create).not.toHaveBeenCalled();
    },
  );

  it("creates a 365-day space", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(prisma.space.create).mockResolvedValue({
      ...activeSpace,
      expiresAt: new Date("2027-07-30T01:00:00.000Z"),
    } as never);

    const response = await authed(request(createApp()).post("/api/spaces"))
      .send({ name: "作品空间", durationDays: 365 });

    expect(response.status).toBe(201);
    expect(prisma.space.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        expiresAt: new Date("2027-07-30T01:00:00.000Z"),
      }),
    }));
  });

  it("lists spaces with deployment counts and expiration", async () => {
    vi.mocked(prisma.space.findMany).mockResolvedValue([{
      ...activeSpace,
      _count: { deployments: 4 },
    }] as never);

    const response = await authed(request(createApp()).get("/api/spaces"));

    expect(response.status).toBe(200);
    expect(prisma.space.findMany).toHaveBeenCalledWith({
      where: { ownerUserId: "user-1" },
      orderBy: { createdAt: "desc" },
      select: expect.objectContaining({
        expiresAt: true,
        _count: expect.any(Object),
      }),
    });
    expect(response.body[0]).toMatchObject({
      id: "s1",
      deploymentCount: 4,
    });
  });

  it("refreshes an active owned space to now plus 365 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.space.update).mockResolvedValue({
      ...activeSpace,
      expiresAt: new Date("2027-07-30T01:00:00.000Z"),
    } as never);

    const response = await authed(
      request(createApp()).post("/api/spaces/s1/extend"),
    );

    expect(response.status).toBe(200);
    expect(prisma.space.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { expiresAt: new Date("2027-07-30T01:00:00.000Z") },
    });
  });

  it("does not extend an expired space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      ...activeSpace,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    } as never);

    const response = await authed(
      request(createApp()).post("/api/spaces/s1/extend"),
    );

    expect(response.status).toBe(410);
    expect(prisma.space.update).not.toHaveBeenCalled();
  });

  it("does not extend another user's space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      ...activeSpace,
      ownerUserId: "user-2",
    } as never);

    const response = await authed(
      request(createApp()).post("/api/spaces/s1/extend"),
    );

    expect(response.status).toBe(404);
    expect(prisma.space.update).not.toHaveBeenCalled();
  });

  it("rejects public uploads to an expired space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      ...activeSpace,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    } as never);

    const response = await request(createApp())
      .post("/api/spaces/s1/deployments")
      .field("title", "作品")
      .attach("files", Buffer.from("<html></html>"), "index.html");

    expect(response.status).toBe(410);
    expect(saveDeploymentFiles).not.toHaveBeenCalled();
  });

  it("rejects batch uploads to an expired space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      ...activeSpace,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    } as never);

    const response = await authed(
      request(createApp())
        .post("/api/spaces/s1/deployments/batch-upload")
        .attach("files", Buffer.from("<html></html>"), "work/index.html"),
    );

    expect(response.status).toBe(410);
    expect(saveDeploymentFiles).not.toHaveBeenCalled();
  });

  it("stores the space cutoff only as a compatibility value", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);

    const response = await request(createApp())
      .post("/api/spaces/s1/deployments")
      .field("title", "作品")
      .field("durationHours", "1")
      .attach("files", Buffer.from("<html></html>"), "index.html");

    expect(response.status).toBe(201);
    expect(prisma.deployment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        expiresAt: activeSpace.expiresAt,
      }),
    }));
  });

  it("returns a safe uploader label for public space works", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([
      {
        id: "d1",
        title: "登录作品",
        publicSlug: "signed-work",
        ownerUserId: "user-1",
        visibility: "visible",
        owner: { username: "member" },
      },
      {
        id: "d2",
        title: "匿名作品",
        publicSlug: "anonymous-work",
        ownerUserId: null,
        visibility: "visible",
        owner: null,
      },
    ] as never);

    const response = await request(createApp()).get("/api/spaces/entry/portfolio");

    expect(response.status).toBe(200);
    expect(prisma.deployment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        owner: {
          select: { username: true },
        },
      },
    }));
    expect(response.body.deployments).toEqual([
      {
        id: "d1",
        title: "登录作品",
        publicSlug: "signed-work",
        ownerUserId: "user-1",
        uploaderName: "member",
      },
      {
        id: "d2",
        title: "匿名作品",
        publicSlug: "anonymous-work",
        ownerUserId: null,
        uploaderName: "匿名",
      },
    ]);
    expect(response.body.deployments[0]).not.toHaveProperty("owner");
  });
});
