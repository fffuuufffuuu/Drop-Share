import cron from "node-cron";

import { prisma } from "./db";
import { removeDeploymentFolder } from "./storage";

export async function cleanupExpiredContent(now = new Date()): Promise<void> {
  const expiredPersonal = await prisma.deployment.findMany({
    where: {
      spaceId: null,
      deletedAt: null,
      expiresAt: { lte: now },
    },
  });

  for (const deployment of expiredPersonal) {
    try {
      await removeDeploymentFolder(deployment.rootPath);
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { deletedAt: now },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[cleanup] failed", deployment.id, error);
    }
  }

  const expiredSpaces = await prisma.space.findMany({
    where: { expiresAt: { lte: now } },
    select: {
      id: true,
      deployments: {
        select: {
          id: true,
          rootPath: true,
        },
      },
    },
  });

  for (const space of expiredSpaces) {
    for (const deployment of space.deployments) {
      try {
        await removeDeploymentFolder(deployment.rootPath);
        await prisma.deployment.delete({
          where: { id: deployment.id },
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[cleanup] failed", deployment.id, error);
      }
    }
  }
}

export function startCleanupJob(): void {
  cron.schedule("*/10 * * * *", async () => {
    await cleanupExpiredContent();
  });
}
