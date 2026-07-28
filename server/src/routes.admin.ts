import { Router } from "express";

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
