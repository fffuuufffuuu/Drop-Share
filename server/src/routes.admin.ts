import { Prisma, Visibility } from "@prisma/client";
import archiver from "archiver";
import { Router } from "express";
import { z } from "zod";

import {
  appendDeploymentFolder,
  archiveDisposition,
  MissingDeploymentFolderError,
  uniqueArchiveFolders,
} from "./archive";
import {
  permanentlyDeleteDeployment,
  permanentlyDeleteSpace,
} from "./admin-deletion";
import { prisma } from "./db";
import { requireAdmin, requireAuth } from "./middleware";
import { registerSpaceTagRoutes } from "./space-tags";
import { registerSpaceDownloadRoutes } from "./space-downloads";
import { mergeSpacesHandler } from "./space-merge";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);
registerSpaceTagRoutes(adminRouter, "/spaces/:id", true);
registerSpaceDownloadRoutes(adminRouter, "/spaces/:id", true);
adminRouter.post("/spaces/merge", mergeSpacesHandler(true));

adminRouter.get("/deployments/personal", async (_req, res) => {
  const deployments = await prisma.deployment.findMany({
    where: { spaceId: null, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      publicSlug: true,
      visibility: true,
      createdAt: true,
      expiresAt: true,
      owner: {
        select: { username: true },
      },
    },
  });

  res.json(deployments.map((deployment) => ({
    id: deployment.id,
    title: deployment.title,
    publicSlug: deployment.publicSlug,
    visibility: deployment.visibility,
    createdAt: deployment.createdAt,
    expiresAt: deployment.expiresAt,
    ownerLabel: deployment.owner?.username ?? "匿名",
  })));
});

adminRouter.patch("/deployments/:id", async (req, res) => {
  const parsed = z.object({
    visibility: z.enum([Visibility.visible, Visibility.hidden]),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "无效的可见状态" });
    return;
  }

  const deployment = await prisma.deployment.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true },
  });
  if (!deployment) {
    res.status(404).json({ message: "网页不存在或已被删除" });
    return;
  }

  const updated = await prisma.deployment.update({
    where: { id: deployment.id },
    data: { visibility: parsed.data.visibility },
  });
  res.json(updated);
});

adminRouter.get("/deployments/:id/download", async (req, res, next) => {
  const deployment = await prisma.deployment.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
    select: {
      title: true,
      rootPath: true,
    },
  });

  if (!deployment) {
    res.status(404).json({ message: "网页不存在或已被删除" });
    return;
  }

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
});

adminRouter.delete("/deployments/:id", async (req, res, next) => {
  try {
    const result = await permanentlyDeleteDeployment(String(req.params.id));
    if (result === "not-found") {
      res.status(404).json({ message: "网页不存在或已被删除" });
      return;
    }
    res.json({ message: "网页已永久删除" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/spaces", async (_req, res) => {
  const spaces = await prisma.space.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ownerUserId: true,
      name: true,
      slug: true,
      createdAt: true,
      expiresAt: true,
      downloadsEnabled: true,
      owner: {
        select: { username: true },
      },
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
    ownerUserId: space.ownerUserId,
    name: space.name,
    slug: space.slug,
    createdAt: space.createdAt,
    expiresAt: space.expiresAt,
    downloadsEnabled: space.downloadsEnabled,
    ownerUsername: space.owner.username,
    deploymentCount: space._count.deployments,
  })));
});

adminRouter.patch("/spaces/:id", async (req, res, next) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "空间名称或 slug 格式无效" });
    return;
  }
  const space = await prisma.space.findUnique({ where: { id: String(req.params.id) } });
  if (!space) {
    res.status(404).json({ message: "空间不存在或已被删除" });
    return;
  }
  if (parsed.data.slug !== space.slug) {
    const duplicate = await prisma.space.findUnique({ where: { slug: parsed.data.slug } });
    if (duplicate) {
      res.status(409).json({ message: "slug 已被其他空间使用" });
      return;
    }
  }
  try {
    const updated = await prisma.space.update({
      where: { id: space.id },
      data: parsed.data,
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ message: "slug 已被其他空间使用" });
      return;
    }
    next(error);
  }
});

adminRouter.get("/spaces/:id/download", async (req, res, next) => {
  const space = await prisma.space.findUnique({
    where: { id: String(req.params.id) },
    select: {
      name: true,
      deployments: {
        where: { deletedAt: null },
        select: {
          title: true,
          rootPath: true,
        },
      },
    },
  });

  if (!space) {
    res.status(404).json({ message: "空间不存在或已被删除" });
    return;
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  const folders = uniqueArchiveFolders(space.deployments.map((deployment) => deployment.title));
  try {
    for (const [index, deployment] of space.deployments.entries()) {
      await appendDeploymentFolder(archive, deployment.rootPath, folders[index]);
    }
  } catch (error) {
    if (error instanceof MissingDeploymentFolderError) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
    return;
  }

  res.type("application/zip");
  res.setHeader("Content-Disposition", archiveDisposition(space.name, "space"));
  archive.on("error", next);
  archive.pipe(res);
  await archive.finalize();
});

adminRouter.delete("/spaces/:id", async (req, res, next) => {
  try {
    const result = await permanentlyDeleteSpace(String(req.params.id));
    if (result === "not-found") {
      res.status(404).json({ message: "空间不存在或已被删除" });
      return;
    }
    res.json({ message: "空间已永久删除" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/spaces/:id", async (req, res) => {
  const space = await prisma.space.findUnique({
    where: { id: String(req.params.id) },
    select: {
      id: true,
      ownerUserId: true,
      name: true,
      slug: true,
      createdAt: true,
      expiresAt: true,
      downloadsEnabled: true,
      owner: {
        select: { username: true },
      },
      deployments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          publicSlug: true,
          tags: { select: { tagId: true } },
          visibility: true,
          createdAt: true,
          expiresAt: true,
          owner: {
            select: { username: true },
          },
        },
      },
      tags: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, spaceId: true, createdAt: true },
      },
    },
  });

  if (!space) {
    res.status(404).json({ message: "空间不存在或已被删除" });
    return;
  }

  res.json({
    id: space.id,
    ownerUserId: space.ownerUserId,
    name: space.name,
    slug: space.slug,
    createdAt: space.createdAt,
    expiresAt: space.expiresAt,
    downloadsEnabled: space.downloadsEnabled,
    ownerUsername: space.owner.username,
    tags: space.tags,
    deployments: space.deployments.map((deployment) => ({
      id: deployment.id,
      title: deployment.title,
      publicSlug: deployment.publicSlug,
      tagIds: deployment.tags.map(({ tagId }) => tagId),
      visibility: deployment.visibility,
      createdAt: deployment.createdAt,
      expiresAt: deployment.expiresAt,
      ownerLabel: deployment.owner?.username ?? "匿名",
    })),
  });
});
