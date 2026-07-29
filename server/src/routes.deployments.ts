import { Visibility } from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { z } from "zod";

import { config } from "./config";
import { prisma } from "./db";
import { requireAuth } from "./middleware";
import { removeDeploymentFolder, saveDeploymentFiles } from "./storage";
import { addHours, randomSlug } from "./utils";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const createSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  durationHours: z.coerce.number().int().min(1).max(24).optional(),
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

deploymentRouter.get("/", requireAuth, async (req, res) => {
  const deployments = await prisma.deployment.findMany({
    where: {
      ownerUserId: req.authUser!.userId,
      spaceId: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      publicSlug: true,
      visibility: true,
      createdAt: true,
      expiresAt: true,
      deletedAt: true,
    },
  });

  res.json(deployments);
});

deploymentRouter.post("/anonymous", upload.array("files", 1000), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) {
    res.status(400).json({ message: "No files uploaded" });
    return;
  }
  const publicSlug = randomSlug(10);
  const deploymentId = randomSlug(18);
  const now = new Date();
  const expiresAt = addHours(now, config.defaultExpiresHours);
  const rootPath = await saveDeploymentFiles(
    path.join("anonymous", deploymentId),
    buildUploadItems(files, req.body.paths),
  );

  const deployment = await prisma.deployment.create({
    data: {
      id: deploymentId,
      title: req.body.title || `anonymous-${deploymentId.slice(0, 6)}`,
      publicSlug,
      rootPath,
      expiresAt,
      uploaderIp: req.ip,
      uploaderAgent: req.headers["user-agent"] ?? null,
    },
  });

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

  const duration = payload.data.durationHours ?? config.defaultExpiresHours;
  const deploymentId = randomSlug(18);
  const publicSlug = randomSlug(10);
  const expiresAt = addHours(new Date(), duration);

  if (payload.data.spaceId) {
    const space = await prisma.space.findUnique({ where: { id: payload.data.spaceId } });
    if (!space || space.ownerUserId !== req.authUser?.userId) {
      res.status(403).json({ message: "No permission to this space" });
      return;
    }
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
      ownerUserId: req.authUser?.userId,
      spaceId: payload.data.spaceId ?? null,
      publicSlug,
      rootPath,
      expiresAt,
      uploaderIp: req.ip,
      uploaderAgent: req.headers["user-agent"] ?? null,
    },
  });

  res.status(201).json({
    id: deployment.id,
    url: `${config.baseUrl}/p/${publicSlug}`,
    expiresAt,
  });
});

deploymentRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = z
    .object({
      visibility: z.enum([Visibility.visible, Visibility.hidden]),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid visibility value" });
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
    deployment.space?.ownerUserId === req.authUser?.userId;

  if (!canManage) {
    res.status(403).json({ message: "No permission" });
    return;
  }

  const updated = await prisma.deployment.update({
    where: { id: deployment.id },
    data: { visibility: parsed.data.visibility },
  });
  res.json(updated);
});

deploymentRouter.delete("/:id", requireAuth, async (req, res) => {
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
    deployment.space?.ownerUserId === req.authUser?.userId;

  if (!canManage) {
    res.status(403).json({ message: "No permission" });
    return;
  }

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { deletedAt: new Date() },
  });
  try {
    await removeDeploymentFolder(deployment.rootPath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[delete] removeDeploymentFolder failed", deployment.id, err);
  }

  res.json({ message: "已关闭并释放链接" });
});
