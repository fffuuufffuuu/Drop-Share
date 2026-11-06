import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "./db";
import { notificationRouter } from "./notifications";
vi.mock("./db", () => ({ prisma: { notification: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() } } }));
vi.mock("./middleware", () => ({ requireAuth: (req: any, res: any, next: any) => { if (!req.headers.authorization) return res.status(401).end(); req.authUser = { userId: "u1" }; next(); } }));
const app = express().use(express.json()).use(notificationRouter);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(prisma.notification.count).mockResolvedValue(2); vi.mocked(prisma.notification.findMany).mockResolvedValue([]); vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 }); });
it("requires authentication and keeps counts private and scoped to the recipient", async () => {
  expect((await request(app).get("/unread-count")).status).toBe(401);
  const response = await request(app).get("/unread-count").set("Authorization", "token");
  expect(response.body).toEqual({ unreadCount: 2 });
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(prisma.notification.count).toHaveBeenCalledWith({ where: { recipientId: "u1", readAt: null } });
});
it("uses bounded keyset pagination and ignores visitor-supplied recipient IDs", async () => {
  await request(app).get("/?recipientId=other&before=2026-11-05T00%3A00%3A00.000Z&beforeId=c1").set("Authorization", "token");
  expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ recipientId: "u1", OR: expect.any(Array) }), take: 31, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
});
it("marks only the recipient's message and never overwrites an existing read timestamp", async () => {
  expect((await request(app).patch("/c1/read").set("Authorization", "token")).status).toBe(204);
  expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { id: "c1", recipientId: "u1", readAt: null }, data: { readAt: expect.any(Date) } });
  vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 0 });
  expect((await request(app).patch("/other/read").set("Authorization", "token")).status).toBe(204);
});
it("marks all prior unread messages without consuming subsequently arriving messages", async () => {
  expect((await request(app).post("/read-all").set("Authorization", "token")).status).toBe(204);
  expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { recipientId: "u1", readAt: null, createdAt: { lte: expect.any(Date) } }, data: { readAt: expect.any(Date) } });
});
