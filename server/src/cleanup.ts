import cron from "node-cron";

import { prisma } from "./db";
import { removeDeploymentFolder } from "./storage";

export function startCleanupJob(): void {
  cron.schedule("*/10 * * * *", async () => {
    const expired = await prisma.deployment.findMany({
      where: {
        deletedAt: null,
        expiresAt: { lt: new Date() },
      },
    });

    for (const deployment of expired) {
      try {
        await removeDeploymentFolder(deployment.rootPath);
        await prisma.deployment.update({
          where: { id: deployment.id },
          data: { deletedAt: new Date() },
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[cleanup] failed", deployment.id, error);
      }
    }
  });
}
