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
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
  app.use(express.json());
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

  it("returns the current user's space uploads with their destination spaces", async () => {
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([
      {
        id: "space-deployment-1",
        title: "班级作品",
        publicSlug: "class-work",
        visibility: "visible",
        createdAt: new Date("2026-07-30T01:00:00.000Z"),
        expiresAt: new Date("2027-07-30T01:00:00.000Z"),
        deletedAt: null,
        space: {
          id: "space-1",
          name: "物理作品集",
          slug: "physics-gallery",
        },
      },
    ] as never);

    const response = await request(createApp())
      .get("/api/deployments/space-uploads")
      .set("Authorization", "Bearer user-token");

    expect(response.status).toBe(200);
    expect(prisma.deployment.findMany).toHaveBeenCalledWith({
      where: {
        ownerUserId: "user-1",
        spaceId: { not: null },
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
        space: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
    expect(response.body[0]).toMatchObject({
      id: "space-deployment-1",
      space: {
        id: "space-1",
        name: "物理作品集",
        slug: "physics-gallery",
      },
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

  it("uses the owned space cutoff without requiring personal duration", async () => {
    const spaceExpiration = new Date("2027-01-01T00:00:00.000Z");
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      id: "s1",
      ownerUserId: "user-1",
      expiresAt: spaceExpiration,
    } as never);

    const response = await request(createApp())
      .post("/api/deployments")
      .set("Authorization", "Bearer user-token")
      .field("spaceId", "s1")
      .attach("files", Buffer.from("<html></html>"), "index.html");

    expect(response.status).toBe(201);
    expect(prisma.deployment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        spaceId: "s1",
        expiresAt: spaceExpiration,
      }),
    }));
  });

  it.each([
    ["/api/deployments/anonymous", false],
    ["/api/deployments", true],
  ])("stores a bounded User-Agent for %s", async (url, authenticated) => {
    let upload = request(createApp()).post(url).set("User-Agent", `Browser/${"x".repeat(300)}`);
    if (authenticated) upload = upload.set("Authorization", "Bearer user-token");
    if (authenticated) upload = upload.field("durationDays", "1");
    const response = await upload.attach("files", Buffer.from("<html></html>"), "index.html");

    expect(response.status).toBe(201);
    const savedAgent = vi.mocked(prisma.deployment.create).mock.calls[0][0].data.uploaderAgent;
    expect(savedAgent?.length).toBeLessThanOrEqual(191);
  });

  it("rejects a duplicate named project in an owned space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      id: "s1",
      ownerUserId: "user-1",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    } as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue({ id: "existing" } as never);

    const response = await request(createApp())
      .post("/api/deployments")
      .set("Authorization", "Bearer user-token")
      .field("spaceId", "s1")
      .field("title", "已存在的项目")
      .attach("files", Buffer.from("<html></html>"), "index.html");

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("同名");
    expect(saveDeploymentFiles).not.toHaveBeenCalled();
    expect(prisma.deployment.create).not.toHaveBeenCalled();
  });
});

describe("deployment title updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a space owner to rename a project", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({
      id: "d1",
      title: "旧项目名",
      ownerUserId: "someone-else",
      spaceId: "s1",
      space: { ownerUserId: "user-1" },
    } as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.deployment.update).mockResolvedValue({
      id: "d1",
      title: "新的项目名",
    } as never);

    const response = await request(createApp())
      .patch("/api/deployments/d1")
      .set("Authorization", "Bearer user-token")
      .send({ title: "新的项目名" });

    expect(response.status).toBe(200);
    expect(prisma.deployment.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { title: "新的项目名" },
    });
  });

  it("allows the uploader to rename a personal project", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({
      id: "personal-1",
      ownerUserId: "user-1",
      spaceId: null,
      space: null,
    } as never);
    vi.mocked(prisma.deployment.update).mockResolvedValue({
      id: "personal-1",
      title: "新的个人作品",
    } as never);

    const response = await request(createApp())
      .patch("/api/deployments/personal-1")
      .set("Authorization", "Bearer user-token")
      .send({ title: "新的个人作品" });

    expect(response.status).toBe(200);
    expect(prisma.deployment.update).toHaveBeenCalledWith({
      where: { id: "personal-1" },
      data: { title: "新的个人作品" },
    });
  });

  it("does not allow another user to rename a personal project", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({
      id: "personal-1",
      ownerUserId: "another-user",
      spaceId: null,
      space: null,
    } as never);

    const response = await request(createApp())
      .patch("/api/deployments/personal-1")
      .set("Authorization", "Bearer user-token")
      .send({ title: "不能更改" });

    expect(response.status).toBe(403);
    expect(prisma.deployment.update).not.toHaveBeenCalled();
  });

  it("rejects a duplicate project name inside a space", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({
      id: "d1",
      title: "旧项目名",
      ownerUserId: "user-1",
      spaceId: "s1",
      space: { ownerUserId: "owner-1" },
    } as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue({ id: "d2" } as never);

    const response = await request(createApp())
      .patch("/api/deployments/d1")
      .set("Authorization", "Bearer user-token")
      .send({ title: "已存在" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("同名");
    expect(prisma.deployment.update).not.toHaveBeenCalled();
  });
});
