import { Prisma } from "@prisma/client";
import type { Router } from "express";
import { z } from "zod";

import { permanentlyDeleteDeployment } from "./admin-deletion";
import { prisma } from "./db";
import { requireAuth } from "./middleware";
import { removeDeploymentFolder } from "./storage";

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });
const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setTags"), ids: z.array(z.string()).min(1).max(200), tagIds: z.array(z.string()).max(100) }),
  z.object({ action: z.literal("addTags"), ids: z.array(z.string()).min(1).max(200), tagIds: z.array(z.string()).min(1).max(100) }),
  z.object({ action: z.literal("delete"), ids: z.array(z.string()).min(1).max(200) }),
]);

export function registerSpaceTagRoutes(router: Router, prefix: string, admin: boolean) {
  async function allowed(spaceId: string, userId: string | undefined) {
    const space = await prisma.space.findUnique({ where: { id: spaceId } });
    return space && (admin || space.ownerUserId === userId) ? space : null;
  }

    router.post(`${prefix}/tags`, requireAuth, async (req, res) => {
      const parsed = nameSchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ message: "标签名称须为 1 至 80 个字" });
      const space = await allowed(String(req.params.id), req.authUser?.userId);
      if (!space) return void res.status(404).json({ message: "空间不存在" });
      try {
        const tag = await prisma.spaceTag.create({ data: { spaceId: space.id, name: parsed.data.name } });
        res.status(201).json(tag);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return void res.status(409).json({ message: "该空间已有同名标签" });
        }
        throw error;
      }
    });

    router.patch(`${prefix}/tags/:tagId`, requireAuth, async (req, res) => {
      const parsed = nameSchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ message: "标签名称须为 1 至 80 个字" });
      const space = await allowed(String(req.params.id), req.authUser?.userId);
      if (!space) return void res.status(404).json({ message: "空间不存在" });
      const tag = await prisma.spaceTag.findFirst({ where: { id: String(req.params.tagId), spaceId: space.id } });
      if (!tag) return void res.status(404).json({ message: "标签不存在" });
      try {
        res.json(await prisma.spaceTag.update({ where: { id: tag.id }, data: { name: parsed.data.name } }));
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return void res.status(409).json({ message: "该空间已有同名标签" });
        }
        throw error;
      }
    });

    router.delete(`${prefix}/tags/:tagId`, requireAuth, async (req, res) => {
      const space = await allowed(String(req.params.id), req.authUser?.userId);
      if (!space) return void res.status(404).json({ message: "空间不存在" });
      const tag = await prisma.spaceTag.findFirst({ where: { id: String(req.params.tagId), spaceId: space.id } });
      if (!tag) return void res.status(404).json({ message: "标签不存在" });
      await prisma.spaceTag.delete({ where: { id: tag.id } });
      res.json({ message: "标签已删除，作品保留" });
    });
  router.post(`${prefix}/deployments/bulk`, requireAuth, async (req, res) => {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success || new Set(parsed.data.ids).size !== parsed.data.ids.length) {
      return void res.status(400).json({ message: "请选择 1 至 200 个不重复的作品" });
    }
    const space = await allowed(String(req.params.id), req.authUser?.userId);
    if (!space) return void res.status(404).json({ message: "空间不存在或无权管理" });
    const deployments = await prisma.deployment.findMany({
      where: { id: { in: parsed.data.ids }, spaceId: space.id, deletedAt: null },
      select: { id: true, rootPath: true },
    });
    if (deployments.length !== parsed.data.ids.length) {
      return void res.status(400).json({ message: "部分作品不属于该空间或已删除，请刷新后重试" });
    }
    if (parsed.data.action === "setTags" || parsed.data.action === "addTags") {
      if (new Set(parsed.data.tagIds).size !== parsed.data.tagIds.length) {
        return void res.status(400).json({ message: "标签不能重复" });
      }
      const tags = await prisma.spaceTag.findMany({
        where: { id: { in: parsed.data.tagIds }, spaceId: space.id },
        select: { id: true },
      });
      if (tags.length !== parsed.data.tagIds.length) {
        return void res.status(400).json({ message: "部分标签不属于该空间" });
      }
      await prisma.$transaction(async (tx) => {
        if (parsed.data.action === "setTags") {
          await tx.deploymentTag.deleteMany({ where: { deploymentId: { in: parsed.data.ids } } });
        }
        if (tags.length) await tx.deploymentTag.createMany({
          data: deployments.flatMap((deployment) => tags.map((tag) => ({
            deploymentId: deployment.id, tagId: tag.id,
          }))),
          ...(parsed.data.action === "addTags" ? { skipDuplicates: true } : {}),
        });
      });
      return void res.json({ count: deployments.length });
    }
    if (admin) {
      for (const deployment of deployments) await permanentlyDeleteDeployment(deployment.id);
    } else {
      await prisma.deployment.updateMany({
        where: { id: { in: parsed.data.ids }, spaceId: space.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      for (const deployment of deployments) {
        try {
          await removeDeploymentFolder(deployment.rootPath);
        } catch (error) {
          console.error("[bulk-delete] removeDeploymentFolder failed", deployment.id, error);
        }
      }
    }
    res.json({ count: deployments.length });
  });
}
