import { scheduleThumbnail, readyThumbnailVersion } from "./thumbnail-service";
import { Prisma, Visibility } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { z } from "zod";

import { config } from "./config";
import { prisma } from "./db";
import { requireAuth } from "./middleware";
import {
  addDays,
  ANONYMOUS_DAYS,
  isExpired,
  MAX_PERSONAL_DAYS,
} from "./retention";
import { removeDeploymentFolder, saveDeploymentFiles } from "./storage";
import { randomSlug, uploaderAgentForStorage } from "./utils";
import { sendZip } from "./space-downloads";
import {canManageSpace,workCapabilities} from "./space-permissions";
import {registerDeploymentVersionRoutes} from "./deployment-versions";
import {lockSpace} from "./space-contributors";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const createSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(2000, "简介最多 2000 字").optional().default(""),
  durationDays: z.coerce.number().int().min(1).max(MAX_PERSONAL_DAYS).optional(),
  spaceId: z.string().optional(),
});

function buildUploadItems(files: Express.Multer.File[], paths: string[] | string | undefined) {
  const pathList = Array.isArray(paths) ? paths : paths ? [paths] : [];
  return files.map((file, idx) => ({
    file,
    relativePath: pathList[idx] || file.originalname,
  }));
}

export const deploymentRouter = Router();
registerDeploymentVersionRoutes(deploymentRouter);

deploymentRouter.get("/", requireAuth, async (req, res) => {
  const deployments = await prisma.deployment.findMany({
    where: {
      ownerUserId: req.authUser!.userId,
      spaceId: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ownerUserId: true,
      previousRootPath: true,
      rootPath: true,
      title: true,
      publicSlug: true,
      viewCount: true,
      visibility: true,
      createdAt: true,
      expiresAt: true,
      deletedAt: true,
    },
  });

  res.json(await Promise.all(deployments.map(async({previousRootPath,rootPath,...deployment})=>({...deployment,thumbnailVersion:await readyThumbnailVersion({...deployment,rootPath,space: null}),...await workCapabilities({...deployment,previousRootPath},req.authUser?.userId)}))));
});

deploymentRouter.get("/space-uploads", requireAuth, async (req, res) => {
  const deployments = await prisma.deployment.findMany({
    where: {
      ownerUserId: req.authUser!.userId,
      spaceId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ownerUserId: true,
      previousRootPath: true,
      rootPath: true,
      title: true,
      publicSlug: true,
      viewCount: true,
      visibility: true,
      createdAt: true,
      expiresAt: true,
      deletedAt: true,
      space: {
        select: {
          id: true,
          ownerUserId: true,
          expiresAt: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  res.json(await Promise.all(deployments.map(async({previousRootPath,rootPath,...deployment})=>({...deployment,thumbnailVersion:await readyThumbnailVersion({...deployment,rootPath,space: deployment.space}),...await workCapabilities({...deployment,previousRootPath},req.authUser?.userId)}))));
});

deploymentRouter.post("/anonymous", upload.array("files", 1000), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) {
    res.status(400).json({ message: "No files uploaded" });
    return;
  }
  const payload = createSchema.pick({ description: true }).safeParse(req.body);
  if (!payload.success) {
    res.status(400).json({ message: payload.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }
  const publicSlug = randomSlug(10);
  const deploymentId = randomSlug(18);
  const now = new Date();
  const expiresAt = addDays(now, ANONYMOUS_DAYS);
  const rootPath = await saveDeploymentFiles(
    path.join("anonymous", deploymentId),
    buildUploadItems(files, req.body.paths),
  );

  const deployment = await prisma.deployment.create({
    data: {
      id: deploymentId,
      title: req.body.title || `anonymous-${deploymentId.slice(0, 6)}`,
      description: payload.data.description,
      publicSlug,
      rootPath,
      expiresAt,
      uploaderIp: req.ip,
      uploaderAgent: uploaderAgentForStorage(req.headers["user-agent"]),
    },
  });

  scheduleThumbnail(deployment.publicSlug);
  res.status(201).json({
    id: deployment.id,
    url: `${config.baseUrl}/p/${publicSlug}`,
    expiresAt,
  });
});

deploymentRouter.post("/", requireAuth, upload.array("files", 1000), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) {
    res.status(400).json({ message: "No files uploaded" });
    return;
  }
  const payload = createSchema.safeParse(req.body);
  if (!payload.success) {
    res.status(400).json({ message: payload.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const deploymentId = randomSlug(18);
  const publicSlug = randomSlug(10);
  let expiresAt: Date;

  if (payload.data.spaceId) {
    const space = await prisma.space.findUnique({ where: { id: payload.data.spaceId } });
    if (!space || !await canManageSpace(space,req.authUser?.userId)) {
      res.status(403).json({ message: "No permission to this space" });
      return;
    }
    if (isExpired(space.expiresAt)) {
      res.status(410).json({ message: "Space has expired" });
      return;
    }
    if (payload.data.title) {
      const duplicate = await prisma.deployment.findFirst({
        where: {
          spaceId: payload.data.spaceId,
          deletedAt: null,
          title: payload.data.title,
        },
        select: { id: true },
      });
      if (duplicate) {
        res.status(400).json({ message: "该空间中已存在同名项目，请换一个名称" });
        return;
      }
    }
    expiresAt = space.expiresAt;
  } else {
    if (payload.data.durationDays === undefined) {
      res.status(400).json({ message: "durationDays is required" });
      return;
    }
    expiresAt = addDays(new Date(), payload.data.durationDays);
  }

  const scope = payload.data.spaceId ? `spaces/${payload.data.spaceId}` : `users/${req.authUser?.userId}`;
  const rootPath = await saveDeploymentFiles(
    path.join(scope, deploymentId),
    buildUploadItems(files, req.body.paths),
  );

  const deployment = await prisma.deployment.create({
    data: {
      id: deploymentId,
      title: payload.data.title || `site-${deploymentId.slice(0, 6)}`,
      description: payload.data.description,
      ownerUserId: req.authUser?.userId,
      spaceId: payload.data.spaceId ?? null,
      publicSlug,
      rootPath,
      expiresAt,
      uploaderIp: req.ip,
      uploaderAgent: uploaderAgentForStorage(req.headers["user-agent"]),
    },
  });

  scheduleThumbnail(deployment.publicSlug);
  res.status(201).json({
    id: deployment.id,
    url: `${config.baseUrl}/p/${publicSlug}`,
    expiresAt,
  });
});

deploymentRouter.get("/:id/download", requireAuth, async (req, res, next) => {
  const deployment = await prisma.deployment.findFirst({
    where: { id: String(req.params.id), ownerUserId: req.authUser!.userId, deletedAt: null },
    select: { title: true, rootPath: true },
  });
  if (!deployment) { res.status(404).json({ message: "作品不存在或无权下载" }); return; }
  await sendZip(deployment, res, next);
});

deploymentRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = z
    .object({
      visibility: z.enum([Visibility.visible, Visibility.hidden]).optional(),
      title: z.string().trim().min(1).max(80).optional(),
    })
    .refine((value) => value.visibility !== undefined || value.title !== undefined)
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid deployment update" });
    return;
  }

  const deployment = await prisma.deployment.findUnique({
    where: { id: String(req.params.id) },
    include: { space: true },
  });
  if (!deployment) {
    res.status(404).json({ message: "Deployment not found" });
    return;
  }

  const canManage =
    deployment.ownerUserId === req.authUser?.userId ||
    !!deployment.space && await canManageSpace(deployment.space,req.authUser?.userId);

  if (!canManage) {
    res.status(403).json({ message: "No permission" });
    return;
  }

  if (parsed.data.title !== undefined && deployment.spaceId) {
    const duplicate = await prisma.deployment.findFirst({
      where: {
        id: { not: deployment.id },
        spaceId: deployment.spaceId,
        deletedAt: null,
        title: parsed.data.title,
      },
      select: { id: true },
    });
    if (duplicate) {
      res.status(400).json({ message: "该空间中已存在同名项目，请换一个名称" });
      return;
    }
  }

  const updated = await prisma.deployment.update({
    where: { id: deployment.id },
    data: {
      ...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    },
  });
  const {rootPath,previousRootPath,uploaderIp,uploaderAgent,...publicDeployment}=updated;
  res.json(publicDeployment);
});

deploymentRouter.delete("/:id", requireAuth, async (req, res) => {
  const snapshot = await prisma.deployment.findUnique({
    where: { id: String(req.params.id) },
    include: { space: true },
  });
  if (!snapshot) {
    res.status(404).json({ message: "Deployment not found" });
    return;
  }

  const deployment=await prisma.$transaction(async tx=>{
    if(snapshot.spaceId)await lockSpace(tx,snapshot.spaceId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM Deployment WHERE id = ${snapshot.id} FOR UPDATE`);
    const current=await tx.deployment.findUnique({where:{id:snapshot.id},include:{space:true}});
    if(!current)return null;
    const canManage=current.ownerUserId===req.authUser?.userId||!!current.space&&await canManageSpace(current.space,req.authUser?.userId,tx);
    if(!canManage)return null;
    await tx.deployment.update({where:{id:current.id},data:{deletedAt:new Date()}});
    return current;
  });
  if(!deployment){res.status(403).json({message:"作品不存在或无权删除"});return;}
  try {
    await removeDeploymentFolder(deployment.rootPath);
    if(deployment.previousRootPath)await removeDeploymentFolder(deployment.previousRootPath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[delete] removeDeploymentFolder failed", deployment.id, err);
  }

  res.json({ message: "已关闭并释放链接" });
});
