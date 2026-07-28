import { prisma } from "./db";
import { removeDeploymentFolder } from "./storage";

export async function permanentlyDeleteDeployment(
  id: string,
): Promise<"deleted" | "not-found"> {
  const deployment = await prisma.deployment.findUnique({
    where: { id },
    select: {
      id: true,
      rootPath: true,
    },
  });

  if (!deployment) {
    return "not-found";
  }

  await removeDeploymentFolder(deployment.rootPath);
  await prisma.deployment.delete({ where: { id: deployment.id } });
  return "deleted";
}

export async function permanentlyDeleteSpace(
  id: string,
): Promise<"deleted" | "not-found"> {
  const space = await prisma.space.findUnique({
    where: { id },
    select: {
      id: true,
      deployments: {
        select: { rootPath: true },
      },
    },
  });

  if (!space) {
    return "not-found";
  }

  for (const deployment of space.deployments) {
    await removeDeploymentFolder(deployment.rootPath);
  }

  await prisma.$transaction([
    prisma.deployment.deleteMany({ where: { spaceId: space.id } }),
    prisma.space.delete({ where: { id: space.id } }),
  ]);
  return "deleted";
}
