import cron from "node-cron";
import {Prisma} from "@prisma/client";

import { prisma } from "./db";
import { removeDeploymentFolder } from "./storage";
import {lockSpace} from "./space-contributors";

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
      await prisma.$transaction(async tx=>{
        await tx.$queryRaw(Prisma.sql`SELECT id FROM Deployment WHERE id = ${deployment.id} FOR UPDATE`);
        const current=await tx.deployment.findUnique({where:{id:deployment.id}});
        if(!current||current.spaceId||current.deletedAt||current.expiresAt>now)return;
        await removeDeploymentFolder(current.rootPath);
        if(current.previousRootPath)await removeDeploymentFolder(current.previousRootPath);
        await tx.deployment.update({where:{id:current.id},data:{deletedAt:now}});
      },{timeout:120000});
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[cleanup] failed", deployment.id, error);
    }
  }

  const expiredSpaces = await prisma.space.findMany({
    where: { expiresAt: { lte: now } },
    select: {
      id: true,
    },
  });

  for (const space of expiredSpaces) {
    try{
      await prisma.$transaction(async tx=>{
        await lockSpace(tx,space.id);
        const current=await tx.space.findUnique({where:{id:space.id},select:{expiresAt:true,deployments:{select:{id:true,rootPath:true,previousRootPath:true}}}});
        if(!current||current.expiresAt>now)return;
        for(const work of current.deployments){
          await removeDeploymentFolder(work.rootPath);
          if(work.previousRootPath)await removeDeploymentFolder(work.previousRootPath);
          await tx.deployment.delete({where:{id:work.id}});
        }
      },{timeout:120000});
    }catch(error){console.error("[cleanup] failed",space.id,error);}
  }
}

export function startCleanupJob(): void {
  cron.schedule("*/10 * * * *", async () => {
    await cleanupExpiredContent();
  });
}
