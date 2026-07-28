import { ZipArchive } from "archiver";
import { Router } from "express";

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

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

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

  const archive = new ZipArchive({ zlib: { level: 9 } });
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
      name: true,
      slug: true,
      createdAt: true,
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
    name: space.name,
    slug: space.slug,
    createdAt: space.createdAt,
    ownerUsername: space.owner.username,
    deploymentCount: space._count.deployments,
  })));
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

  const archive = new ZipArchive({ zlib: { level: 9 } });
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
      name: true,
      slug: true,
      createdAt: true,
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
          visibility: true,
          createdAt: true,
          expiresAt: true,
          owner: {
            select: { username: true },
          },
        },
      },
    },
  });

  if (!space) {
    res.status(404).json({ message: "空间不存在或已被删除" });
    return;
  }

  res.json({
    id: space.id,
    name: space.name,
    slug: space.slug,
    createdAt: space.createdAt,
    ownerUsername: space.owner.username,
    deployments: space.deployments.map((deployment) => ({
      id: deployment.id,
      title: deployment.title,
      publicSlug: deployment.publicSlug,
      visibility: deployment.visibility,
      createdAt: deployment.createdAt,
      expiresAt: deployment.expiresAt,
      ownerLabel: deployment.owner?.username ?? "匿名",
    })),
  });
});
