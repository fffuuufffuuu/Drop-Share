import express from "express";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { registerPublicSpaceDownloadRoute, registerSpaceDownloadRoutes } from "./space-downloads";

vi.mock("./db", () => ({ prisma: {
  space: { findUnique: vi.fn(), update: vi.fn() },
  deployment: { findFirst: vi.fn() },
} }));
vi.mock("./middleware", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.authUser = { userId: String(req.headers["x-user"] || "owner"), username: "member" };
    next();
  },
}));

function app() {
  const server = express();
  server.use(express.json());
  const router = express.Router();
  registerSpaceDownloadRoutes(router, "/:id", false);
  registerPublicSpaceDownloadRoute(router);
  server.use("/api/spaces", router);
  return server;
}

const space = {
  id: "s1", slug: "demo", ownerUserId: "owner",
  expiresAt: new Date("2099-01-01"), downloadsEnabled: false,
};
let root = "";

beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(tmpdir(), "drop-share-download-"));
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "index.html"), "<h1>作品</h1>");
  vi.mocked(prisma.space.findUnique).mockResolvedValue(space as never);
  vi.mocked(prisma.deployment.findFirst).mockResolvedValue({
    title: "轨道演示", rootPath: root,
  } as never);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("space downloads", () => {
  it("blocks anonymous download while the switch is off", async () => {
    const response = await request(app()).get("/api/spaces/entry/demo/deployments/d1/download");
    expect(response.status).toBe(403);
    expect(prisma.deployment.findFirst).not.toHaveBeenCalled();
  });

  it("serves a visible work as a ZIP when enabled", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({ ...space, downloadsEnabled: true } as never);
    const response = await request(app()).get("/api/spaces/entry/demo/deployments/d1/download");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/zip/);
    expect(response.headers["content-disposition"]).toContain(".zip");
    expect(prisma.deployment.findFirst).toHaveBeenCalledWith({
      where: {
        id: "d1", spaceId: "s1", deletedAt: null,
        visibility: "visible", expiresAt: { gt: expect.any(Date) },
      },
      select: { title: true, rootPath: true },
    });
  });

  it("lets the owner download even when public downloads are disabled", async () => {
    const response = await request(app()).get("/api/spaces/s1/deployments/d1/download");
    expect(response.status).toBe(200);
  });

  it("only lets the owner change public download permission", async () => {
    const denied = await request(app()).patch("/api/spaces/s1/downloads")
      .set("x-user", "other").send({ downloadsEnabled: true });
    expect(denied.status).toBe(404);
    vi.mocked(prisma.space.update).mockResolvedValue({ ...space, downloadsEnabled: true } as never);
    const allowed = await request(app()).patch("/api/spaces/s1/downloads")
      .send({ downloadsEnabled: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.downloadsEnabled).toBe(true);
  });
});
