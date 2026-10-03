import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { registerSpaceTagRoutes } from "./space-tags";
import { removeDeploymentFolder } from "./storage";

vi.mock("./db", () => ({ prisma: {
  space: { findUnique: vi.fn() },
  spaceTag: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
  deployment: { findMany: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
} }));
vi.mock("./storage", () => ({ removeDeploymentFolder: vi.fn() }));
vi.mock("./admin-deletion", () => ({ permanentlyDeleteDeployment: vi.fn() }));
vi.mock("./middleware", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.authUser = { userId: String(req.headers["x-user"] || "owner"), username: "member" };
    next();
  },
}));

function app(admin = false) {
  const server = express();
  server.use(express.json());
  const router = express.Router();
  registerSpaceTagRoutes(router, "/spaces/:id", admin);
  server.use(router);
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.space.findUnique).mockResolvedValue({ id: "s1", ownerUserId: "owner" } as never);
  vi.mocked(prisma.deployment.findMany).mockResolvedValue([
    { id: "d1", rootPath: "storage/s1/d1" },
    { id: "d2", rootPath: "storage/s1/d2" },
  ] as never);
});

describe("space tag management", () => {
  it("lets the space owner create tags, while denying other users", async () => {
    vi.mocked(prisma.spaceTag.create).mockResolvedValue({ id: "t1", name: "课件" } as never);
    const owner = await request(app()).post("/spaces/s1/tags").send({ name: "课件" });
    expect(owner.status).toBe(201);
    const stranger = await request(app()).post("/spaces/s1/tags").set("x-user", "stranger").send({ name: "课件" });
    expect(stranger.status).toBe(404);
    const admin = await request(app(true)).post("/spaces/s1/tags").send({ name: "课件" });
    expect(admin.status).toBe(201);
  });

  it("sets multiple tags on selected works in one transaction", async () => {
    vi.mocked(prisma.spaceTag.findMany).mockResolvedValue([{ id: "t1" }, { id: "t2" }] as never);
    const tx = { deploymentTag: { deleteMany: vi.fn(), createMany: vi.fn() } };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));
    const response = await request(app()).post("/spaces/s1/deployments/bulk")
      .send({ action: "setTags", ids: ["d1", "d2"], tagIds: ["t1", "t2"] });
    expect(response.status).toBe(200);
    expect(tx.deploymentTag.deleteMany).toHaveBeenCalledWith({
      where: { deploymentId: { in: ["d1", "d2"] } },
    });
    expect(tx.deploymentTag.createMany).toHaveBeenCalledWith({ data: [
      { deploymentId: "d1", tagId: "t1" }, { deploymentId: "d1", tagId: "t2" },
      { deploymentId: "d2", tagId: "t1" }, { deploymentId: "d2", tagId: "t2" },
    ] });
  });

  it("adds tags without deleting existing tags or duplicating associations", async () => {
    vi.mocked(prisma.spaceTag.findMany).mockResolvedValue([{ id: "t1" }] as never);
    const tx = { deploymentTag: { deleteMany: vi.fn(), createMany: vi.fn() } };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));
    const response = await request(app()).post("/spaces/s1/deployments/bulk")
      .send({ action: "addTags", ids: ["d1", "d2"], tagIds: ["t1"] });
    expect(response.status).toBe(200);
    expect(tx.deploymentTag.deleteMany).not.toHaveBeenCalled();
    expect(tx.deploymentTag.createMany).toHaveBeenCalledWith({
      data: [{ deploymentId: "d1", tagId: "t1" }, { deploymentId: "d2", tagId: "t1" }],
      skipDuplicates: true,
    });
  });

  it("rejects foreign tags and users who do not own the space", async () => {
    vi.mocked(prisma.spaceTag.findMany).mockResolvedValue([]);
    const foreign = await request(app(true)).post("/spaces/s1/deployments/bulk")
      .send({ action: "setTags", ids: ["d1", "d2"], tagIds: ["foreign"] });
    expect(foreign.status).toBe(400);
    const stranger = await request(app()).post("/spaces/s1/deployments/bulk").set("x-user", "stranger")
      .send({ action: "setTags", ids: ["d1", "d2"], tagIds: [] });
    expect(stranger.status).toBe(404);
  });

  it("keeps owner bulk deletion available", async () => {
    const response = await request(app()).post("/spaces/s1/deployments/bulk")
      .send({ action: "delete", ids: ["d1", "d2"] });
    expect(response.status).toBe(200);
    expect(prisma.deployment.updateMany).toHaveBeenCalled();
    expect(removeDeploymentFolder).toHaveBeenCalledTimes(2);
  });
});
