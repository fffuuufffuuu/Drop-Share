import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { isExpired } from "./retention";

type PermissionDb = Pick<Prisma.TransactionClient, "spaceAdministrator" | "user">;
export type ManagedSpace = {id:string;ownerUserId:string;expiresAt?:Date};
export async function canManageSpace(space:ManagedSpace,userId:string|undefined,db:PermissionDb=prisma):Promise<boolean>{
  if(!userId)return false;
  if(space.ownerUserId===userId)return true;
  return !!await db.spaceAdministrator.findUnique({where:{spaceId_userId:{spaceId:space.id,userId}}});
}
export async function isSiteAdministrator(userId:string|undefined,db:PermissionDb=prisma):Promise<boolean>{
  return !!userId && (await db.user.findUnique({where:{id:userId},select:{role:true}}))?.role==="ADMIN";
}
export async function workCapabilities(work:{ownerUserId:string|null;space?:ManagedSpace|null;spaceId?:string|null;deletedAt?:Date|null;expiresAt?:Date;previousRootPath?:string|null},userId:string|undefined,db:PermissionDb=prisma,known?:{spaceManager?:boolean;siteAdministrator?:boolean}){
  const hasPreviousVersion=!!work.previousRootPath;
  const expiry=work.space?.expiresAt??work.expiresAt;
  if(!userId||work.deletedAt||(expiry&&isExpired(expiry)))return {canUpdate:false,canRollback:false,hasPreviousVersion};
  const manager=known?.spaceManager??(work.space?await canManageSpace(work.space,userId,db):false);
  const canUpdate=work.ownerUserId===userId||manager||(known?.siteAdministrator??await isSiteAdministrator(userId,db));
  return {canUpdate,canRollback:manager&&hasPreviousVersion,hasPreviousVersion};
}
