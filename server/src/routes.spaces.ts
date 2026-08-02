import { Router } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";
import { z } from "zod";

import { permanentlyDeleteSpace } from "./admin-deletion";
import { prisma } from "./db";
import { requireAuth } from "./middleware";
import {
  addDays,
  isExpired,
  MAX_SPACE_DAYS,
  SPACE_EXTENSION_DAYS,
} from "./retention";
import { saveDeploymentFiles } from "./storage";
import { randomSlug } from "./utils";

import { config } from "./config";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const createSpaceSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(2)
    .max(40)
    .optional(),
  durationDays: z.coerce.number().int().min(1).max(MAX_SPACE_DAYS),
});

function uploadItems(files: Express.Multer.File[], paths: string[] | string | undefined) {
  const pathList = Array.isArray(paths) ? paths : paths ? [paths] : [];
  return files.map((file, idx) => ({
    file,
    relativePath: String(pathList[idx] || file.originalname),
  }));
}

export const spaceRouter = Router();

spaceRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createSpaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const slug = parsed.data.slug ?? randomSlug(8);
  const space = await prisma.space.create({
    data: {
      name: parsed.data.name,
      slug,
      ownerUserId: req.authUser!.userId,
      expiresAt: addDays(new Date(), parsed.data.durationDays),
    },
  });

  res.status(201).json({
    ...space,
    deploymentCount: 0,
    entryUrl: `${config.baseUrl}/s/${space.slug}`,
  });
});

spaceRouter.get("/", requireAuth, async (req, res) => {
  const spaces = await prisma.space.findMany({
    where: { ownerUserId: req.authUser!.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      expiresAt: true,
      _count: {
        select: {
          deployments: {
            where: { deletedAt: null },
          },
        },
      },
    },
  });
  res.json(spaces.map((space) => ({
    id: space.id,
    name: space.name,
    slug: space.slug,
    createdAt: space.createdAt,
    expiresAt: space.expiresAt,
    deploymentCount: space._count.deployments,
  })));
});

spaceRouter.get("/:id", requireAuth, async (req, res) => {
  const space = await prisma.space.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!space || space.ownerUserId !== req.authUser?.userId) {
    res.status(404).json({ message: "Space not found" });
    return;
  }
  if (isExpired(space.expiresAt)) {
    res.status(410).json({ message: "Space has expired" });
    return;
  }
  const deployments = await prisma.deployment.findMany({
    where: { spaceId: space.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      owner: {
        select: { username: true },
      },
    },
  });
  res.json({
    ...space,
    deployments: deployments.map(({ owner, ...deployment }) => ({
      ...deployment,
      uploaderName: owner?.username ?? "匿名",
    })),
  });
});

spaceRouter.post("/:id/extend", requireAuth, async (req, res) => {
  const space = await prisma.space.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!space || space.ownerUserId !== req.authUser?.userId) {
    res.status(404).json({ message: "Space not found" });
    return;
  }
  if (isExpired(space.expiresAt)) {
    res.status(410).json({ message: "Space has expired and cannot be extended" });
    return;
  }

  const updated = await prisma.space.update({
    where: { id: space.id },
    data: { expiresAt: addDays(new Date(), SPACE_EXTENSION_DAYS) },
  });
  res.json(updated);
});

spaceRouter.delete("/:id", requireAuth, async (req, res, next) => {
  const space = await prisma.space.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!space || space.ownerUserId !== req.authUser?.userId) {
    res.status(404).json({ message: "空间不存在或无权删除" });
    return;
  }

  try {
    const result = await permanentlyDeleteSpace(space.id);
    if (result === "not-found") {
      res.status(404).json({ message: "空间不存在或已被删除" });
      return;
    }
    res.json({ message: "空间已永久删除" });
  } catch (error) {
    next(error);
  }
});

spaceRouter.post("/:id/deployments", upload.array("files", 1000), async (req, res) => {
  const space = await prisma.space.findUnique({ where: { id: String(req.params.id) } });
  if (!space) {
    res.status(404).json({ message: "Space not found" });
    return;
  }
  if (isExpired(space.expiresAt)) {
    res.status(410).json({ message: "Space has expired" });
    return;
  }

  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) {
    res.status(400).json({ message: "No files uploaded" });
    return;
  }

  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  if (!title || title.length > 80) {
    res.status(400).json({ message: "请提供 1～80 字的项目名称" });
    return;
  }
  const existing = await prisma.deployment.findFirst({
    where: { spaceId: space.id, deletedAt: null, title },
  });
  if (existing) {
    res.status(400).json({ message: "该空间中已存在同名项目，请换一个名称" });
    return;
  }

  const requesterToken = req.headers.authorization?.replace("Bearer ", "").trim() || "";
  let ownerUserId: string | null = null;
  if (requesterToken.length > 10) {
    try {
      const payload = jwt.verify(requesterToken, config.jwtSecret) as { userId?: string };
      const auth = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (auth) ownerUserId = auth.id;
    } catch {
      ownerUserId = null;
    }
  }

  const deploymentId = randomSlug(18);
  const publicSlug = randomSlug(10);
  const rootPath = await saveDeploymentFiles(
    path.join("spaces", space.id, deploymentId),
    uploadItems(files, req.body.paths),
  );

  const deployment = await prisma.deployment.create({
    data: {
      id: deploymentId,
      title,
      ownerUserId,
      spaceId: space.id,
      publicSlug,
      rootPath,
      expiresAt: space.expiresAt,
      uploaderIp: req.ip,
      uploaderAgent: req.headers["user-agent"] ?? null,
    },
  });

  res.status(201).json({
    id: deployment.id,
    url: `${config.baseUrl}/p/${deployment.publicSlug}`,
    expiresAt: deployment.expiresAt,
  });
});

spaceRouter.post("/:id/deployments/batch-upload", requireAuth, upload.array("files", 3000), async (req, res) => {
  const space = await prisma.space.findUnique({ where: { id: String(req.params.id) } });
  if (!space || space.ownerUserId !== req.authUser?.userId) {
    res.status(403).json({ message: "No permission" });
    return;
  }
  if (isExpired(space.expiresAt)) {
    res.status(410).json({ message: "Space has expired" });
    return;
  }
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) {
    res.status(400).json({ message: "No files uploaded" });
    return;
  }

  const grouped = new Map<string, { file: Express.Multer.File; relativePath: string }[]>();
  const paths = (Array.isArray(req.body.paths) ? req.body.paths : req.body.paths ? [req.body.paths] : []).map(
    (item: unknown) => String(item),
  );

  files.forEach((file, index) => {
    const rp = paths[index] || file.originalname;
    const key = rp.split("/")[0] || "site";
    const list = grouped.get(key) || [];
    list.push({ file, relativePath: rp.substring(key.length + 1) || "index.html" });
    grouped.set(key, list);
  });

  const created: Array<{ id: string; url: string }> = [];
  for (const [siteName, groupFiles] of grouped.entries()) {
    const deploymentId = randomSlug(18);
    const publicSlug = randomSlug(10);
    const rootPath = await saveDeploymentFiles(
      path.join("spaces", space.id, deploymentId),
      groupFiles,
    );
    const dep = await prisma.deployment.create({
      data: {
        id: deploymentId,
        title: siteName,
        ownerUserId: req.authUser!.userId,
        spaceId: space.id,
        publicSlug,
        rootPath,
        expiresAt: space.expiresAt,
      },
    });
    created.push({ id: dep.id, url: `${config.baseUrl}/p/${dep.publicSlug}` });
  }

  res.status(201).json({ count: created.length, deployments: created });
});

spaceRouter.get("/entry/:slug", async (req, res) => {
  const space = await prisma.space.findUnique({ where: { slug: req.params.slug } });
  if (!space) {
    res.status(404).json({ message: "Space not found" });
    return;
  }
  if (isExpired(space.expiresAt)) {
    res.status(410).json({ message: "Space has expired" });
    return;
  }
  const deployments = await prisma.deployment.findMany({
    where: {
      spaceId: space.id,
      deletedAt: null,
    },
    include: {
      owner: {
        select: { username: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const visible = deployments.filter((deployment) => deployment.visibility === "visible");
  res.json({
    space: {
      id: space.id,
      name: space.name,
      slug: space.slug,
      expiresAt: space.expiresAt,
    },
    deployments: visible.map((deployment) => ({
      id: deployment.id,
      title: deployment.title,
      publicSlug: deployment.publicSlug,
      ownerUserId: deployment.ownerUserId,
      uploaderName: deployment.owner?.username ?? "匿名",
    })),
  });
});
