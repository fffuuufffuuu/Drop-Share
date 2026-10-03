import express from "express";
import { stat } from "node:fs/promises";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { permanentlyDeleteSpace } from "./admin-deletion";
import { prisma } from "./db";
import { spaceRouter } from "./routes.spaces";
import { removeDeploymentFolder, saveDeploymentFiles } from "./storage";

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
    spaceTag: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("./storage", () => ({
  removeDeploymentFolder: vi.fn(),
  saveDeploymentFiles: vi.fn(),
}));

vi.mock("./admin-deletion", () => ({
  permanentlyDeleteSpace: vi.fn(),
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
  expiresAt: new Date("2099-08-01T01:00:00.000Z"),
};

describe("space expiration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.spaceTag.findMany).mockResolvedValue([]);
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

  it("lets the creator rename a space without changing its slug", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.space.update).mockResolvedValue({ ...activeSpace, name: "新名称" } as never);

    const response = await authed(request(createApp()).patch("/api/spaces/s1"))
      .send({ name: " 新名称 ", slug: "changed" });

    expect(response.status).toBe(200);
    expect(prisma.space.update).toHaveBeenCalledWith({
      where: { id: "s1" }, data: { name: "新名称" },
    });
  });

  it("denies another user renaming a space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({ ...activeSpace, ownerUserId: "user-2" } as never);

    const response = await authed(request(createApp()).patch("/api/spaces/s1"))
      .send({ name: "不应修改" });

    expect(response.status).toBe(404);
    expect(prisma.space.update).not.toHaveBeenCalled();
  });

  it("returns uploader labels in an owned space detail", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([
      {
        id: "d1",
        title: "登录作品",
        publicSlug: "signed-work",
        visibility: "visible",
        createdAt: now,
        expiresAt: activeSpace.expiresAt,
        owner: { username: "member" },
        tags: [],
      },
      {
        id: "d2",
        title: "匿名作品",
        publicSlug: "anonymous-work",
        visibility: "hidden",
        createdAt: now,
        expiresAt: activeSpace.expiresAt,
        owner: null,
        tags: [],
      },
    ] as never);

    const response = await authed(request(createApp()).get("/api/spaces/s1"));

    expect(response.status).toBe(200);
    expect(prisma.deployment.findMany).toHaveBeenCalledWith({
      where: { spaceId: "s1", deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { username: true } }, tags: { select: { tagId: true } } },
    });
    expect(response.body.deployments).toEqual([
      expect.objectContaining({ id: "d1", uploaderName: "member" }),
      expect.objectContaining({ id: "d2", uploaderName: "匿名" }),
    ]);
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

  it("permanently deletes an owned active space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(permanentlyDeleteSpace).mockResolvedValue("deleted");

    const response = await authed(request(createApp()).delete("/api/spaces/s1"));

    expect(response.status).toBe(200);
    expect(permanentlyDeleteSpace).toHaveBeenCalledWith("s1");
    expect(response.body).toEqual({ message: "空间已永久删除" });
  });

  it("allows an owner to permanently delete an expired space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      ...activeSpace,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    } as never);
    vi.mocked(permanentlyDeleteSpace).mockResolvedValue("deleted");

    const response = await authed(request(createApp()).delete("/api/spaces/s1"));

    expect(response.status).toBe(200);
    expect(permanentlyDeleteSpace).toHaveBeenCalledWith("s1");
  });

  it("does not delete another user's space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      ...activeSpace,
      ownerUserId: "user-2",
    } as never);

    const response = await authed(request(createApp()).delete("/api/spaces/s1"));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "空间不存在或无权删除" });
    expect(permanentlyDeleteSpace).not.toHaveBeenCalled();
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

  it("creates one project per standalone HTML file in a batch", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);

    const response = await authed(request(createApp()).post("/api/spaces/s1/deployments/batch-upload")
      .field("paths", "orbit.html").field("paths", "lesson.html")
      .attach("files", Buffer.from("<html>orbit</html>"), "orbit.html")
      .attach("files", Buffer.from("<html>lesson</html>"), "lesson.html"));

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(2);
    expect(vi.mocked(prisma.deployment.create).mock.calls.map(([arg]) => arg.data.title))
      .toEqual(["orbit", "lesson"]);
    expect(vi.mocked(saveDeploymentFiles).mock.calls.map(([, items]) => items.map((item) => item.relativePath)))
      .toEqual([["index.html"], ["index.html"]]);
  });

  it("accepts a public space upload with a long browser User-Agent", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);
    const userAgent = `Browser/${"x".repeat(300)}`;

    const response = await request(createApp())
      .post("/api/spaces/s1/deployments")
      .set("User-Agent", userAgent)
      .field("title", "Vector-Lab-Sophie")
      .attach("files", Buffer.from("<html></html>"), "index.html");

    expect(response.status).toBe(201);
    expect(prisma.deployment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ uploaderAgent: expect.any(String) }),
    }));
    const savedAgent = vi.mocked(prisma.deployment.create).mock.calls[0][0].data.uploaderAgent;
    expect(savedAgent?.length).toBeLessThanOrEqual(191);
  });

  it("removes saved files when a public space deployment cannot be recorded", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.deployment.create).mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(createApp())
      .post("/api/spaces/s1/deployments")
      .field("title", "作品")
      .attach("files", Buffer.from("<html></html>"), "index.html");

    expect(response.status).toBe(500);
    expect(removeDeploymentFolder).toHaveBeenCalledWith("storage/spaces/s1/d1");
  });

  it("accepts a batch file larger than the ordinary 20 MB limit without buffering it in memory", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    const size = 21 * 1024 * 1024;
    let temporaryPath = "";
    vi.mocked(saveDeploymentFiles).mockImplementation(async (_baseDir, items) => {
      expect(items[0].file.buffer).toBeUndefined();
      temporaryPath = items[0].file.path;
      expect((await stat(items[0].file.path)).size).toBe(size);
      return "storage/spaces/s1/d1";
    });

    const response = await authed(request(createApp()).post("/api/spaces/s1/deployments/batch-upload")
      .field("paths", "large/index.html")
      .attach("files", Buffer.alloc(size, 97), "index.html"));

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(1);
    await vi.waitFor(async () => {
      await expect(stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("names a selected site after its folder, not its index file", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);

    const response = await authed(request(createApp()).post("/api/spaces/s1/deployments/batch-upload")
      .field("paths", "教学互动演示/index.html")
      .field("paths", "教学互动演示/assets/app.js")
      .attach("files", Buffer.from("<html>demo</html>"), "index.html")
      .attach("files", Buffer.from("app"), "app.js"));

    expect(response.status).toBe(201);
    expect(prisma.deployment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: "教学互动演示" }),
    }));
    expect(vi.mocked(saveDeploymentFiles).mock.calls[0][1].map((item) => item.relativePath))
      .toEqual(["index.html", "assets/app.js"]);
    expect(response.body.deployments[0].title).toBe("教学互动演示");
  });

  it("creates a project for each site folder inside a selected parent folder", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);

    const response = await authed(request(createApp()).post("/api/spaces/s1/deployments/batch-upload")
      .field("paths", "collection/orbit/index.html")
      .field("paths", "collection/orbit/assets/app.js")
      .field("paths", "collection/lesson/index.html")
      .attach("files", Buffer.from("<html>orbit</html>"), "index.html")
      .attach("files", Buffer.from("app"), "app.js")
      .attach("files", Buffer.from("<html>lesson</html>"), "index.html"));

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(2);
    expect(vi.mocked(prisma.deployment.create).mock.calls.map(([arg]) => arg.data.title))
      .toEqual(["orbit", "lesson"]);
    expect(vi.mocked(saveDeploymentFiles).mock.calls.map(([, items]) => items.map((item) => item.relativePath)))
      .toEqual([["index.html", "assets/app.js"], ["index.html"]]);
  });

  it("rejects a folder without any HTML file before saving that project", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);

    const response = await authed(request(createApp()).post("/api/spaces/s1/deployments/batch-upload")
      .field("paths", "orbit/app.js")
      .attach("files", Buffer.from("app"), "app.js"));

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(0);
    expect(response.body.failures).toEqual([
      { title: "orbit", message: "没有找到 HTML 文件" },
    ]);
    expect(saveDeploymentFiles).not.toHaveBeenCalled();
  });

  it("uses the only HTML file as the homepage when index.html is absent", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(activeSpace as never);
    vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);

    const response = await authed(request(createApp()).post("/api/spaces/s1/deployments/batch-upload")
      .field("paths", "collection/座位表/座位表.html")
      .field("paths", "collection/座位表/style.css")
      .field("paths", "collection/缺页/app.js")
      .attach("files", Buffer.from("<html>seat</html>"), "座位表.html")
      .attach("files", Buffer.from("css"), "style.css")
      .attach("files", Buffer.from("js"), "app.js"));

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(1);
    expect(response.body.deployments[0].title).toBe("座位表");
    expect(response.body.failures).toEqual([
      { title: "缺页", message: "没有找到 HTML 文件" },
    ]);
    expect(vi.mocked(saveDeploymentFiles).mock.calls[0][1].map((item) => item.relativePath))
      .toEqual(["index.html", "style.css"]);
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
        tags: [],
      },
      {
        id: "d2",
        title: "匿名作品",
        publicSlug: "anonymous-work",
        ownerUserId: null,
        visibility: "visible",
        owner: null,
        tags: [],
      },
    ] as never);

    const response = await request(createApp()).get("/api/spaces/entry/portfolio");

    expect(response.status).toBe(200);
    expect(prisma.deployment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        owner: {
          select: { username: true },
        },
        tags: { select: { tagId: true } },
      },
    }));
    expect(response.body.deployments).toEqual([
      {
        id: "d1",
        title: "登录作品",
        publicSlug: "signed-work",
        tagIds: [],
        ownerUserId: "user-1",
        uploaderName: "member",
      },
      {
        id: "d2",
        title: "匿名作品",
        publicSlug: "anonymous-work",
        tagIds: [],
        ownerUserId: null,
        uploaderName: "匿名",
      },
    ]);
    expect(response.body.deployments[0]).not.toHaveProperty("owner");
    expect(response.body.space.ownerUserId).toBe("user-1");
  });
});
