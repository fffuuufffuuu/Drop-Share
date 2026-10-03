import { Router } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "node:fs/promises";
import os from "node:os";
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
import { removeDeploymentFolder, saveDeploymentFiles } from "./storage";
import { registerSpaceTagRoutes } from "./space-tags";
import { registerPublicSpaceDownloadRoute, registerSpaceDownloadRoutes } from "./space-downloads";
import { mergeSpacesHandler } from "./space-merge";
import { randomSlug, uploaderAgentForStorage } from "./utils";

import { config } from "./config";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const BATCH_FILE_LIMIT = 2000 * 1024 * 1024;
const batchUpload = multer({ dest: os.tmpdir(), limits: { fileSize: BATCH_FILE_LIMIT } });

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
const renameSpaceSchema = z.object({ name: z.string().trim().min(1).max(80) });

function uploadItems(files: Express.Multer.File[], paths: string[] | string | undefined) {
  const pathList = Array.isArray(paths) ? paths : paths ? [paths] : [];
  return files.map((file, idx) => ({
    file,
    relativePath: String(pathList[idx] || file.originalname),
  }));
}

type BatchFile = { file: Express.Multer.File; path: string };

function groupBatchFiles(files: BatchFile[]) {
  const groups = new Map<string, { file: Express.Multer.File; relativePath: string }[]>();
  const add = (title: string, item: BatchFile, relativePath: string) => {
    if (!title.trim() || title.length > 80) throw new Error("项目名称须为 1 至 80 个字");
    const group = groups.get(title) ?? [];
    group.push({ file: item.file, relativePath });
    groups.set(title, group);
  };
  for (const item of files) {
    item.path = item.path.replace(/\\/g, "/");
    if (item.path.startsWith("/") || item.path.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("文件路径不合法");
    }
  }
  const topLevels = new Set(files.map(({ path: filePath }) => filePath.split("/")[0]));
  const oneFolder = topLevels.size === 1 && files.every(({ path: filePath }) => filePath.includes("/"));
  const root = oneFolder ? files[0].path.split("/")[0] : "";
  const hasRootHtml = oneFolder && files.some(({ path: filePath }) => {
    const parts = filePath.split("/");
    return parts.length === 2 && /\.html?$/i.test(parts[1]);
  });
  const nested = oneFolder && files.some(({ path: filePath }) => filePath.split("/").length >= 3);
  const rootIsSite = oneFolder && (hasRootHtml || !nested);

  for (const item of files) {
    const parts = item.path.split("/");
    if (parts.length === 1) {
      if (!/\.html?$/i.test(item.path)) throw new Error("单独上传的文件须为 HTML 文件");
      add(item.path.replace(/\.html?$/i, ""), item, "index.html");
    } else if (rootIsSite) {
      add(root, item, parts.slice(1).join("/"));
    } else if (oneFolder) {
      if (parts.length < 3) throw new Error("父文件夹中每个项目须放在独立子文件夹内");
      add(parts[1], item, parts.slice(2).join("/"));
    } else {
      add(parts[0], item, parts.slice(1).join("/"));
    }
  }
  const ready = new Map<string, { file: Express.Multer.File; relativePath: string }[]>();
  const failures: BatchFailure[] = [];
  for (const [title, group] of groups) {
    const message = assignBatchHomepage(group);
    if (message) failures.push({ title, message });
    else ready.set(title, group);
  }
  return { groups: ready, failures };
}

type BatchFailure = { title: string; message: string };

function assignBatchHomepage(group: { relativePath: string }[]): string | null {
  const index = group.find((item) => item.relativePath.toLowerCase() === "index.html");
  if (index) {
    index.relativePath = "index.html";
    return null;
  }
  const htmlFiles = group.filter((item) => /\.html?$/i.test(item.relativePath.split("/").pop() ?? ""));
  if (htmlFiles.length === 1) {
    htmlFiles[0].relativePath = "index.html";
    return null;
  }
  if (htmlFiles.length === 0) return "没有找到 HTML 文件";
  return "找到多个 HTML 文件，且没有 index.html";
}

export const spaceRouter = Router();
registerSpaceTagRoutes(spaceRouter, "/:id", false);
registerSpaceDownloadRoutes(spaceRouter, "/:id", false);
registerPublicSpaceDownloadRoute(spaceRouter);
spaceRouter.post("/merge", requireAuth, mergeSpacesHandler(false));

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
      downloadsEnabled: true,
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
    downloadsEnabled: space.downloadsEnabled,
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
      tags: { select: { tagId: true } },
    },
  });
  const tags = await prisma.spaceTag.findMany({
    where: { spaceId: space.id }, orderBy: { createdAt: "asc" },
  });
  res.json({
    ...space,
    tags,
    deployments: deployments.map(({ owner, tags: assignments, ...deployment }) => ({
      ...deployment,
      tagIds: assignments.map(({ tagId }) => tagId),
      uploaderName: owner?.username ?? "匿名",
    })),
  });
});

spaceRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = renameSpaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "空间名称须为 1 至 80 个字" });
    return;
  }
  const space = await prisma.space.findUnique({ where: { id: String(req.params.id) } });
  if (!space || space.ownerUserId !== req.authUser?.userId) {
    res.status(404).json({ message: "空间不存在或无权修改" });
    return;
  }
  const updated = await prisma.space.update({
    where: { id: space.id },
    data: { name: parsed.data.name },
  });
  res.json(updated);
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

  let deployment;
  try {
    deployment = await prisma.deployment.create({
      data: {
        id: deploymentId,
        title,
        ownerUserId,
        spaceId: space.id,
        publicSlug,
        rootPath,
        expiresAt: space.expiresAt,
        uploaderIp: req.ip,
        uploaderAgent: uploaderAgentForStorage(req.headers["user-agent"]),
      },
    });
  } catch (error) {
    await removeDeploymentFolder(rootPath);
    throw error;
  }

  res.status(201).json({
    id: deployment.id,
    url: `${config.baseUrl}/p/${deployment.publicSlug}`,
    expiresAt: deployment.expiresAt,
  });
});

spaceRouter.post("/:id/deployments/batch-upload", requireAuth, batchUpload.array("files", 3000), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  res.once("close", () => {
    void Promise.all(files.map((file) => fs.rm(file.path, { force: true }))).catch((error) => {
      console.error("Batch upload temporary file cleanup failed", error);
    });
  });
  const space = await prisma.space.findUnique({ where: { id: String(req.params.id) } });
  if (!space || space.ownerUserId !== req.authUser?.userId) {
    res.status(403).json({ message: "No permission" });
    return;
  }
  if (isExpired(space.expiresAt)) {
    res.status(410).json({ message: "Space has expired" });
    return;
  }
  if (!files.length) {
    res.status(400).json({ message: "No files uploaded" });
    return;
  }

  const paths = (Array.isArray(req.body.paths) ? req.body.paths : req.body.paths ? [req.body.paths] : []).map(
    (item: unknown) => String(item),
  );
  if (paths.length && paths.length !== files.length) {
    res.status(400).json({ message: "文件路径数量与文件数量不一致" });
    return;
  }
  let grouped: ReturnType<typeof groupBatchFiles>;
  try {
    grouped = groupBatchFiles(files.map((file, index) => ({ file, path: paths[index] || file.originalname })));
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
    return;
  }

  const created: Array<{ id: string; title: string; url: string }> = [];
  const failures = [...grouped.failures];
  for (const [siteName, groupFiles] of grouped.groups.entries()) {
    const existing = await prisma.deployment.findFirst({
      where: { spaceId: space.id, deletedAt: null, title: siteName },
    });
    if (existing) {
      failures.push({ title: siteName, message: "该空间中已存在同名项目" });
      continue;
    }
    try {
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
      created.push({ id: dep.id, title: siteName, url: `${config.baseUrl}/p/${dep.publicSlug}` });
    } catch (error) {
      failures.push({ title: siteName, message: (error as Error).message || "上传失败" });
    }
  }

  res.status(201).json({ count: created.length, deployments: created, failures });
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
      tags: { select: { tagId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const visible = deployments.filter((deployment) => deployment.visibility === "visible");
  const tags = await prisma.spaceTag.findMany({
    where: { spaceId: space.id }, orderBy: { createdAt: "asc" },
  });
  res.json({
    space: {
      id: space.id,
      name: space.name,
      slug: space.slug,
      ownerUserId: space.ownerUserId,
      expiresAt: space.expiresAt,
      downloadsEnabled: space.downloadsEnabled,
    },
    tags,
    deployments: visible.map((deployment) => ({
      id: deployment.id,
      title: deployment.title,
      publicSlug: deployment.publicSlug,
      tagIds: deployment.tags.map(({ tagId }) => tagId),
      ownerUserId: deployment.ownerUserId,
      uploaderName: deployment.owner?.username ?? "匿名",
    })),
  });
});
