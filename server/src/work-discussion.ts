import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "./db";
import { optionalAuth } from "./middleware";
import { canManageSpace, isSiteAdministrator } from "./space-permissions";
import { isDeploymentAvailable } from "./deployment-access";
import { isExpired } from "./retention";

const descriptionSchema = z.object({ description: z.string().trim().max(2000) });
const commentSchema = z.object({ content: z.string().trim().min(1).max(1000) });
const commentSelect = { id: true, authorId: true, content: true, createdAt: true, author: { select: { username: true } } } as const;
function serializeComment(comment: { id: string; authorId: string; content: string; createdAt: Date; author: { username: string } }, canManage: boolean) {
  return { id: comment.id, content: comment.content, createdAt: comment.createdAt, authorName: comment.author.username, canManage };
}

export function registerWorkDiscussionRoutes(router: Router) {
  // Availability and permission checks apply equally to reads and writes.
  router.use("/:workId/discussion", optionalAuth);
  router.use("/:workId/description", optionalAuth);
  router.use("/:workId/comments", optionalAuth);

  async function access(id: string, userId?: string) {
    const work = await prisma.deployment.findUnique({ where: { id }, include: { space: true } });
    if (!work || work.deletedAt) return null;
    const canModerate = !!userId && ((work.space ? await canManageSpace(work.space, userId) : false)
      || await isSiteAdministrator(userId));
    const canEdit = !!userId && (work.ownerUserId === userId || canModerate);
    if ((!isDeploymentAvailable(work) && !canEdit) || isExpired(work.space?.expiresAt ?? work.expiresAt)) return null;
    return { work, canEdit, canModerate };
  }

  router.get("/:workId/discussion", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store"); res.vary("Authorization");
    const result = await access(String(req.params.workId), req.authUser?.userId);
    if (!result) { res.status(404).json({ message: "作品不存在或已不可访问" }); return; }
    const comments = await prisma.deploymentComment.findMany({ where: { deploymentId: result.work.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: commentSelect });
    res.json({ description: result.work.description, comments: comments.map(comment => serializeComment(comment, !!req.authUser && (comment.authorId === req.authUser.userId || result.canModerate))),
      canEdit: result.canEdit, canComment: !!req.authUser });
  });
  router.patch("/:workId/description", async (req, res) => {
    if (!req.authUser) { res.status(401).json({ message: "请先登录" }); return; }
    const result = await access(String(req.params.workId), req.authUser.userId);
    if (!result) { res.status(404).json({ message: "作品不存在或已不可访问" }); return; }
    if (!result.canEdit) { res.status(403).json({ message: "无权编辑该作品简介" }); return; }
    const payload = descriptionSchema.safeParse(req.body);
    if (!payload.success) { res.status(400).json({ message: "简介最多 2000 字" }); return; }
    const updated = await prisma.deployment.update({ where: { id: result.work.id }, data: payload.data, select: { description: true } });
    res.json(updated);
  });
  router.post("/:workId/comments", async (req, res) => {
    if (!req.authUser) { res.status(401).json({ message: "请先登录" }); return; }
    const result = await access(String(req.params.workId), req.authUser.userId);
    if (!result) { res.status(404).json({ message: "作品不存在或已不可访问" }); return; }
    const payload = commentSchema.safeParse(req.body);
    if (!payload.success) { res.status(400).json({ message: "评论须为 1 至 1000 字" }); return; }
    const comment = await prisma.$transaction(async tx => {
      const created = await tx.deploymentComment.create({ data: {
      deploymentId: result.work.id, authorId: req.authUser!.userId, content: payload.data.content,
      }, select: commentSelect });
      if (result.work.ownerUserId && result.work.ownerUserId !== req.authUser!.userId) {
        await tx.notification.create({ data: { recipientId: result.work.ownerUserId, kind: "comment",
          title: `《${result.work.title}》收到新评论`.slice(0, 255),
          content: `${created.author.username}：${created.content}`,
          href: result.work.space ? `/s/${encodeURIComponent(result.work.space.slug)}?work=${encodeURIComponent(result.work.id)}` : `/dashboard?work=${encodeURIComponent(result.work.id)}`,
        } });
      }
      return created;
    });
    res.status(201).json(serializeComment(comment, true));
  });

  async function manageableComment(req: Request, res: Response) {
    if (!req.authUser) { res.status(401).json({ message: "请先登录" }); return null; }
    const result = await access(String(req.params.workId), req.authUser.userId);
    if (!result) { res.status(404).json({ message: "作品不存在或已不可访问" }); return null; }
    const comment = await prisma.deploymentComment.findFirst({ where: { id: String(req.params.commentId), deploymentId: result.work.id }, select: commentSelect });
    if (!comment) { res.status(404).json({ message: "评论不存在" }); return null; }
    if (comment.authorId !== req.authUser.userId && !result.canModerate) { res.status(403).json({ message: "无权管理该评论" }); return null; }
    return { comment, workId: result.work.id };
  }
  router.patch("/:workId/comments/:commentId", async (req, res) => {
    const result = await manageableComment(req, res); if (!result) return;
    const payload = commentSchema.safeParse(req.body);
    if (!payload.success) { res.status(400).json({ message: "评论须为 1 至 1000 字" }); return; }
    const updated = await prisma.deploymentComment.updateMany({ where: { id: result.comment.id, deploymentId: result.workId }, data: payload.data });
    if (!updated.count) { res.status(404).json({ message: "评论不存在" }); return; }
    res.json(serializeComment({ ...result.comment, content: payload.data.content }, true));
  });
  router.delete("/:workId/comments/:commentId", async (req, res) => {
    const result = await manageableComment(req, res); if (!result) return;
    const deleted = await prisma.deploymentComment.deleteMany({ where: { id: result.comment.id, deploymentId: result.workId } });
    if (!deleted.count) { res.status(404).json({ message: "评论不存在" }); return; }
    res.status(204).end();
  });
}

export const workDiscussionRouter = Router();
registerWorkDiscussionRoutes(workDiscussionRouter);
