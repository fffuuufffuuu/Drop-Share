import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "./db";
import { registerWorkDiscussionRoutes } from "./work-discussion";

vi.mock("./db", () => ({ prisma: {
  deployment: { findUnique: vi.fn(), update: vi.fn() },
  deploymentComment: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() }, spaceAdministrator: { findUnique: vi.fn() },
  notification: { create: vi.fn() }, $transaction: vi.fn(),
} }));
vi.mock("./middleware", () => {
  const optionalAuth = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (req.headers.authorization) req.authUser = { userId: "u1", username: "同学" };
    next();
  };
  return { optionalAuth };
});
const app = express(); app.use(express.json()); const router = express.Router();
registerWorkDiscussionRoutes(router); app.use(router);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", ownerUserId: "owner",
    description: "简介", visibility: "visible", deletedAt: null, expiresAt: new Date("2099-01-01"), space: null } as never);
  vi.mocked(prisma.deploymentComment.findMany).mockResolvedValue([]);
  vi.mocked(prisma.deploymentComment.findFirst).mockResolvedValue({ id: "c1", deploymentId: "d1", authorId: "u1", content: "原评论", createdAt: new Date(), author: { username: "同学" } } as never);
  vi.mocked(prisma.deploymentComment.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.deploymentComment.deleteMany).mockResolvedValue({ count: 1 });
});
it("reads public descriptions and comments, but denies hidden works to visitors", async () => {
  vi.mocked(prisma.deploymentComment.findMany).mockResolvedValue([{ id: "c1", content: "已注册用户的评论", createdAt: new Date(), author: { username: "同学" } }] as never);
  expect((await request(app).get("/d1/discussion")).body).toMatchObject({ description: "简介", comments: [{ id: "c1", content: "已注册用户的评论", authorName: "同学" }], canEdit: false, canComment: false });
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ visibility: "hidden", ownerUserId: "owner" } as never);
  expect((await request(app).get("/d1/discussion")).status).toBe(404);
});
it("requires login to comment and rejects blank comments", async () => {
  expect((await request(app).post("/d1/comments").send({ content: "test" })).status).toBe(401);
  expect((await request(app).post("/d1/comments").set("Authorization", "Bearer test").send({ content: "  " })).status).toBe(400);
  expect(prisma.deploymentComment.create).not.toHaveBeenCalled();
});
it("persists a signed-in user's comment with the server-side identity", async () => {
  vi.mocked(prisma.deploymentComment.create).mockResolvedValue({ id: "c1", content: "很好", createdAt: new Date(), author: { username: "同学" } } as never);
  const response = await request(app).post("/d1/comments").set("Authorization", "Bearer test").send({ content: " 很好 ", authorId: "fake" });
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ content: "很好", authorName: "同学" });
  expect(prisma.deploymentComment.create).toHaveBeenCalledWith(expect.objectContaining({ data: { deploymentId: "d1", authorId: "u1", content: "很好" } }));
  expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recipientId: "owner", content: "同学：很好", href: "/dashboard?work=d1" }) }));
});
it("permits only managers to edit descriptions", async () => {
  expect((await request(app).patch("/d1/description").set("Authorization", "Bearer test").send({ description: "new" })).status).toBe(403);
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", ownerUserId: "u1", visibility: "hidden", deletedAt: null, expiresAt: new Date("2099-01-01"), space: null } as never);
  vi.mocked(prisma.deployment.update).mockResolvedValue({ description: "new" } as never);
  expect((await request(app).patch("/d1/description").set("Authorization", "Bearer test").send({ description: "new" })).status).toBe(200);
});

it("denies expired works even to owners and refuses comments on hidden works to other users", async () => {
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", ownerUserId: "u1", visibility: "visible", deletedAt: null, expiresAt: new Date("2000-01-01"), space: null } as never);
  expect((await request(app).get("/d1/discussion").set("Authorization", "Bearer test")).status).toBe(404);
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", ownerUserId: "other", visibility: "hidden", deletedAt: null, expiresAt: new Date("2099-01-01"), space: null } as never);
  expect((await request(app).post("/d1/comments").set("Authorization", "Bearer test").send({ content: "test" })).status).toBe(404);
  expect(prisma.deploymentComment.create).not.toHaveBeenCalled();
});

it("allows a delegated space administrator to edit the description", async () => {
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", ownerUserId: "other", visibility: "visible", deletedAt: null, expiresAt: new Date("2099-01-01"), space: { id: "s1", ownerUserId: "owner", expiresAt: new Date("2099-01-01") } } as never);
  vi.mocked(prisma.spaceAdministrator.findUnique).mockResolvedValue({ spaceId: "s1", userId: "u1" } as never);
  vi.mocked(prisma.deployment.update).mockResolvedValue({ description: "管理者简介" } as never);
  expect((await request(app).patch("/d1/description").set("Authorization", "Bearer test").send({ description: "管理者简介" })).status).toBe(200);
});

it("allows authors to edit and delete their own comments, with trimmed and validated content", async () => {
  const response = await request(app).patch("/d1/comments/c1").set("Authorization", "token").send({ content: " 修改后 " });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ id: "c1", content: "修改后", canManage: true });
  expect(response.body).not.toHaveProperty("authorId");
  expect(prisma.deploymentComment.updateMany).toHaveBeenCalledWith({ where: { id: "c1", deploymentId: "d1" }, data: { content: "修改后" } });
  expect((await request(app).patch("/d1/comments/c1").set("Authorization", "token").send({ content: " " })).status).toBe(400);
  expect((await request(app).patch("/d1/comments/c1").set("Authorization", "token").send({ content: "a".repeat(1001) })).status).toBe(400);
  expect((await request(app).delete("/d1/comments/c1").set("Authorization", "token")).status).toBe(204);
  expect(prisma.deploymentComment.deleteMany).toHaveBeenCalledWith({ where: { id: "c1", deploymentId: "d1" } });
});
it.each(["creator", "space-admin", "site-admin"])("allows %s to manage another person's comment", async role => {
  vi.mocked(prisma.deploymentComment.findFirst).mockResolvedValue({ id: "c1", authorId: "other", content: "评论", createdAt: new Date(), author: { username: "别人" } } as never);
  vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", ownerUserId: "uploader", visibility: "visible", deletedAt: null, expiresAt: new Date("2099-01-01"), space: { id: "s1", ownerUserId: role === "creator" ? "u1" : "owner", expiresAt: new Date("2099-01-01") } } as never);
  if (role === "space-admin") vi.mocked(prisma.spaceAdministrator.findUnique).mockResolvedValue({ userId: "u1" } as never);
  if (role === "site-admin") vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: "ADMIN" } as never);
  expect((await request(app).patch("/d1/comments/c1").set("Authorization", "token").send({ content: "修改" })).status).toBe(200);
  expect((await request(app).delete("/d1/comments/c1").set("Authorization", "token")).status).toBe(204);
});
it("does not let unrelated users or just the work uploader manage another person's comment", async () => {
  vi.mocked(prisma.deploymentComment.findFirst).mockResolvedValue({ id: "c1", authorId: "other" } as never);
  for (const ownerUserId of ["other", "u1"]) {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", ownerUserId, visibility: "visible", expiresAt: new Date("2099-01-01"), space: null } as never);
    expect((await request(app).patch("/d1/comments/c1").set("Authorization", "token").send({ content: "修改" })).status).toBe(403);
    expect((await request(app).delete("/d1/comments/c1").set("Authorization", "token")).status).toBe(403);
  }
  expect(prisma.deploymentComment.updateMany).not.toHaveBeenCalled();
  expect(prisma.deploymentComment.deleteMany).not.toHaveBeenCalled();
});
it("requires authentication and scopes comment lookup to the requested work", async () => {
  expect((await request(app).patch("/d1/comments/c1").send({ content: "修改" })).status).toBe(401);
  expect((await request(app).delete("/d1/comments/c1")).status).toBe(401);
  vi.mocked(prisma.deploymentComment.findFirst).mockResolvedValue(null);
  expect((await request(app).delete("/d1/comments/missing").set("Authorization", "token")).status).toBe(404);
  expect(prisma.deploymentComment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "missing", deploymentId: "d1" } }));
});
it("returns per-comment permissions without caching identity-dependent discussion responses", async () => {
  vi.mocked(prisma.deploymentComment.findMany).mockResolvedValue([{ id: "c1", authorId: "u1", content: "mine", createdAt: new Date(), author: { username: "同学" } }, { id: "c2", authorId: "other", content: "theirs", createdAt: new Date(), author: { username: "别人" } }] as never);
  const response = await request(app).get("/d1/discussion").set("Authorization", "token");
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.body.comments.map((c: any) => c.canManage)).toEqual([true, false]);
  expect((await request(app).get("/d1/discussion")).body.comments.map((c: any) => c.canManage)).toEqual([false, false]);
});
it("does not modify comments on expired, deleted or unavailable hidden works", async () => {
  for (const fields of [{ expiresAt: new Date("2000-01-01") }, { deletedAt: new Date() }, { visibility: "hidden" }]) {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", ownerUserId: "other", visibility: "visible", expiresAt: new Date("2099-01-01"), space: null, ...fields } as never);
    expect((await request(app).patch("/d1/comments/c1").set("Authorization", "token").send({ content: "修改" })).status).toBe(404);
    expect((await request(app).delete("/d1/comments/c1").set("Authorization", "token")).status).toBe(404);
  }
  expect(prisma.deploymentComment.updateMany).not.toHaveBeenCalled();
  expect(prisma.deploymentComment.deleteMany).not.toHaveBeenCalled();
});
it("links comment notifications to the exact space work and skips self-comments or anonymous ownership", async () => {
  vi.mocked(prisma.deploymentComment.create).mockResolvedValue({ id: "c1", authorId: "u1", content: "评论内容", createdAt: new Date(), author: { username: "同学" } } as never);
  for (const ownerUserId of ["owner", "u1", null]) {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({ id: "d1", title: "圆周运动", ownerUserId, visibility: "visible", expiresAt: new Date("2099-01-01"), space: { id: "s1", slug: "physics", ownerUserId: "creator", expiresAt: new Date("2099-01-01") } } as never);
    expect((await request(app).post("/d1/comments").set("Authorization", "token").send({ content: "评论内容" })).status).toBe(201);
  }
  expect(prisma.notification.create).toHaveBeenCalledExactlyOnceWith({ data: { recipientId: "owner", kind: "comment", title: "《圆周运动》收到新评论", content: "同学：评论内容", href: "/s/physics?work=d1" } });
  expect(prisma.$transaction).toHaveBeenCalledTimes(3);
});
