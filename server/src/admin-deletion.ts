import {Prisma} from "@prisma/client";
import { prisma } from "./db";
import {lockSpace} from "./space-contributors";
import { removeDeploymentFolder } from "./storage";

export async function permanentlyDeleteDeployment(
  id: string,
): Promise<"deleted" | "not-found"> {
  const deployment = await prisma.deployment.findUnique({
    where: { id },
    select: {
      id: true,
      rootPath: true,
      spaceId: true,
    },
  });

  if (!deployment) {
    return "not-found";
  }

  const current=await prisma.$transaction(async tx=>{
    if(deployment.spaceId)await lockSpace(tx,deployment.spaceId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM Deployment WHERE id = ${id} FOR UPDATE`);
    const current=await tx.deployment.findUnique({where:{id}});
    if(!current)return null;
    await tx.deployment.update({where:{id},data:{deletedAt:new Date()}});
    return current;
  });
  if(!current)return "not-found";
  // No irreversible filesystem work inside a database transaction. The tombstone
  // prevents a staged update from committing while deletion is in progress.
  await removeDeploymentFolder(current.rootPath);
  if(current.previousRootPath)await removeDeploymentFolder(current.previousRootPath);
  await prisma.deployment.delete({where:{id}});
  return "deleted";
}

export async function permanentlyDeleteSpace(
  id: string,
): Promise<"deleted" | "not-found"> {
  const space=await prisma.$transaction(async tx=>{
  await lockSpace(tx,id);
  const space = await tx.space.findUnique({
    where: { id },
    select: {
      id: true,
      deployments: {
        select: { rootPath: true, previousRootPath: true },
      },
    },
  });

  if(!space)return null;
  await tx.space.update({where:{id},data:{expiresAt:new Date(0)}});
  await tx.deployment.updateMany({where:{spaceId:id},data:{deletedAt:new Date()}});
  return space;
  });
  if(!space)return "not-found";
  for(const work of space.deployments){
    await removeDeploymentFolder(work.rootPath);
    if(work.previousRootPath)await removeDeploymentFolder(work.previousRootPath);
  }
  await prisma.$transaction(async tx=>{
    await lockSpace(tx,id);
    await tx.deployment.deleteMany({where:{spaceId:id}});
    await tx.space.delete({where:{id}});
  });
  return "deleted";
}
