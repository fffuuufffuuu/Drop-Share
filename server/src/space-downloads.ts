import archiver from "archiver";
import type { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";

import { appendDeploymentFolder, archiveDisposition, MissingDeploymentFolderError } from "./archive";
import { prisma } from "./db";
import { requireAuth } from "./middleware";
import { isExpired } from "./retention";

async function sendZip(deployment: { title: string; rootPath: string }, res: Response, next: NextFunction) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  try {
    await appendDeploymentFolder(archive, deployment.rootPath);
  } catch (error) {
    if (error instanceof MissingDeploymentFolderError) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
    return;
  }
  res.type("application/zip");
  res.setHeader("Content-Disposition", archiveDisposition(deployment.title, "site"));
  archive.on("error", next);
  archive.pipe(res);
  await archive.finalize();
}

export function registerSpaceDownloadRoutes(router: Router, prefix: string, admin: boolean) {
  router.patch(`${prefix}/downloads`, requireAuth, async (req, res) => {
    const parsed = z.object({ downloadsEnabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ message: "下载开关的值无效" });
    const space = await prisma.space.findUnique({ where: { id: String(req.params.id) } });
    if (!space || (!admin && space.ownerUserId !== req.authUser?.userId)) {
      return void res.status(404).json({ message: "空间不存在或无权修改" });
    }
    const updated = await prisma.space.update({
      where: { id: space.id }, data: { downloadsEnabled: parsed.data.downloadsEnabled },
    });
    res.json({ downloadsEnabled: updated.downloadsEnabled });
  });

  if (!admin) {
    router.get(`${prefix}/deployments/:deploymentId/download`, requireAuth,
      async (req: Request, res: Response, next: NextFunction) => {
        const space = await prisma.space.findUnique({ where: { id: String(req.params.id) } });
        if (!space || space.ownerUserId !== req.authUser?.userId) {
          return void res.status(404).json({ message: "空间不存在或无权下载" });
        }
        const deployment = await prisma.deployment.findFirst({
          where: { id: String(req.params.deploymentId), spaceId: space.id, deletedAt: null },
          select: { title: true, rootPath: true },
        });
        if (!deployment) return void res.status(404).json({ message: "作品不存在" });
        await sendZip(deployment, res, next);
      });
  }
}

export function registerPublicSpaceDownloadRoute(router: Router) {
  router.get("/entry/:slug/deployments/:deploymentId/download",
    async (req: Request, res: Response, next: NextFunction) => {
      const space = await prisma.space.findUnique({ where: { slug: String(req.params.slug) } });
      if (!space || isExpired(space.expiresAt)) {
        return void res.status(404).json({ message: "空间不存在或已过期" });
      }
      if (!space.downloadsEnabled) {
        return void res.status(403).json({ message: "该空间未开放作品下载" });
      }
      const deployment = await prisma.deployment.findFirst({
        where: {
          id: String(req.params.deploymentId), spaceId: space.id, deletedAt: null,
          visibility: "visible", expiresAt: { gt: new Date() },
        },
        select: { title: true, rootPath: true },
      });
      if (!deployment) return void res.status(404).json({ message: "作品不存在或不可下载" });
      await sendZip(deployment, res, next);
    });
}
