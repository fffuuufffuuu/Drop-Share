import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db";
import { requireAuth } from "./middleware";

export const notificationRouter = Router();
notificationRouter.use((req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); res.vary("Authorization"); next(); }, requireAuth);
notificationRouter.get("/unread-count", async (req, res) => {
  res.json({ unreadCount: await prisma.notification.count({ where: { recipientId: req.authUser!.userId, readAt: null } }) });
});
notificationRouter.get("/", async (req, res) => {
  const query = z.object({ before: z.iso.datetime().optional(), beforeId: z.string().min(1).max(191).optional() }).safeParse(req.query);
  if (!query.success || !!query.data.before !== !!query.data.beforeId) { res.status(400).json({ message: "消息分页参数无效" }); return; }
  const { before, beforeId } = query.data;
  const items = await prisma.notification.findMany({ where: { recipientId: req.authUser!.userId,
    ...(before && beforeId ? { OR: [{ createdAt: { lt: new Date(before) } }, { createdAt: new Date(before), id: { lt: beforeId } }] } : {}),
  }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
    select: { id: true, kind: true, title: true, content: true, href: true, createdAt: true, readAt: true } });
  const notifications = items.slice(0, 30); const last = notifications[notifications.length - 1];
  res.json({ notifications, next: items.length > 30 && last ? { before: last.createdAt, beforeId: last.id } : null });
});
notificationRouter.patch("/:id/read", async (req, res) => {
  await prisma.notification.updateMany({ where: { id: String(req.params.id), recipientId: req.authUser!.userId, readAt: null }, data: { readAt: new Date() } });
  res.status(204).end();
});
notificationRouter.post("/read-all", async (req, res) => {
  const now = new Date();
  await prisma.notification.updateMany({ where: { recipientId: req.authUser!.userId, readAt: null, createdAt: { lte: now } }, data: { readAt: now } });
  res.status(204).end();
});
