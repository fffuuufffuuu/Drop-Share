import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { deploymentRouter } from "./routes.deployments";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      findMany: vi.fn(),
    },
  },
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
  beforeEach(() => vi.clearAllMocks());

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
