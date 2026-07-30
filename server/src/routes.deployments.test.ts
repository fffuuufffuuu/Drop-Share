import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { deploymentRouter } from "./routes.deployments";
import { saveDeploymentFiles } from "./storage";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    space: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("./storage", () => ({
  removeDeploymentFolder: vi.fn(),
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
  app.use("/api/deployments", deploymentRouter);
  return app;
}

describe("personal deployment history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveDeploymentFiles).mockResolvedValue("storage/test");
    vi.mocked(prisma.deployment.create).mockResolvedValue({
      id: "deployment-1",
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a request without a logged-in user", async () => {
    const response = await request(createApp()).get("/api/deployments");

    expect(response.status).toBe(401);
    expect(prisma.deployment.findMany).not.toHaveBeenCalled();
  });

  it("returns only the current user's direct uploads including expired and deleted history", async () => {
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([
      {
        id: "deployment-1",
        title: "个人首页",
        publicSlug: "personal-home",
        visibility: "visible",
        createdAt: new Date("2026-07-28T01:00:00.000Z"),
        expiresAt: new Date("2026-07-29T01:00:00.000Z"),
        deletedAt: new Date("2026-07-29T02:00:00.000Z"),
      },
    ] as never);

    const response = await request(createApp())
      .get("/api/deployments")
      .set("Authorization", "Bearer user-token");

    expect(response.status).toBe(200);
    expect(prisma.deployment.findMany).toHaveBeenCalledWith({
      where: {
        ownerUserId: "user-1",
        spaceId: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        publicSlug: true,
        visibility: true,
        createdAt: true,
        expiresAt: true,
        deletedAt: true,
      },
    });
    expect(response.body[0]).toMatchObject({
      id: "deployment-1",
      deletedAt: "2026-07-29T02:00:00.000Z",
    });
  });
});

describe("personal deployment retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveDeploymentFiles).mockResolvedValue("storage/test");
    vi.mocked(prisma.deployment.create).mockResolvedValue({
      id: "deployment-1",
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("always gives anonymous uploads exactly one day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T01:00:00.000Z"));

    const response = await request(createApp())
      .post("/api/deployments/anonymous")
      .field("durationDays", "30")
      .attach("files", Buffer.from("<html></html>"), "index.html");

    expect(response.status).toBe(201);
    expect(prisma.deployment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        expiresAt: new Date("2026-07-31T01:00:00.000Z"),
      }),
    }));
  });

  it.each(["0", "31", "1.5"])(
    "rejects personal durationDays=%s",
    async (durationDays) => {
      const response = await request(createApp())
        .post("/api/deployments")
        .set("Authorization", "Bearer user-token")
        .field("durationDays", durationDays)
        .attach("files", Buffer.from("<html></html>"), "index.html");

      expect(response.status).toBe(400);
      expect(prisma.deployment.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["1", "2026-07-31T01:00:00.000Z"],
    ["30", "2026-08-29T01:00:00.000Z"],
  ])(
    "accepts personal durationDays=%s",
    async (durationDays, expectedExpiration) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-30T01:00:00.000Z"));

      const response = await request(createApp())
        .post("/api/deployments")
        .set("Authorization", "Bearer user-token")
        .field("durationDays", durationDays)
        .attach("files", Buffer.from("<html></html>"), "index.html");

      expect(response.status).toBe(201);
      expect(prisma.deployment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date(expectedExpiration),
        }),
      }));
    },
  );
});
