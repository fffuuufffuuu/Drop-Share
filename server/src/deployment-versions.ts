import {scheduleThumbnail} from "./thumbnail-service";
import {Prisma} from "@prisma/client";
import type {Router,Request,Response,NextFunction} from "express";
import multer from "multer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {config} from "./config";
import {prisma} from "./db";
import {requireAuth} from "./middleware";
import {workCapabilities} from "./space-permissions";
import {lockSpace} from "./space-contributors";
import {removeDeploymentFolder,saveDeploymentFiles,type UploadItem} from "./storage";
import {randomSlug} from "./utils";

export class VersionError extends Error{constructor(public status:number,message:string){super(message);}}
async function loadWork(id:string,userId:string,rollback=false,db:Prisma.TransactionClient=prisma){
  const work=await db.deployment.findUnique({where:{id},include:{space:true}});
  if(!work)throw new VersionError(404,"作品不存在");
  const permissions=await workCapabilities(work,userId,db);
  if(!(rollback?permissions.canRollback:permissions.canUpdate))throw new VersionError(403,rollback?"无权回退该作品，或没有上一版":"无权更新该作品，或作品已过期／删除");
  return work;
}
function validateItems(items:UploadItem[]){
  if(!items.length)throw new VersionError(400,"请选择 HTML 文件或作品文件夹");
  const seen=new Set<string>();
  for(const item of items){
    const relative=item.relativePath.replace(/\\/g,"/");
    if(!relative||relative.startsWith("/")||/[\0:]/.test(relative)||relative.split("/").some(part=>!part||part===".."||part==="."))throw new VersionError(400,"上传文件路径不合法");
    if(seen.has(relative.toLowerCase()))throw new VersionError(400,"文件路径不能重复");
    seen.add(relative.toLowerCase());
  }
  if(!(items.length===1&&/\.html$/i.test(items[0].relativePath))&&!seen.has("index.html"))throw new VersionError(400,"文件夹必须包含 index.html");
}
async function commitRoots(snapshot:Awaited<ReturnType<typeof loadWork>>,userId:string,newRoot:string,rollback:boolean){
  return prisma.$transaction(async tx=>{
    if(snapshot.spaceId)await lockSpace(tx,snapshot.spaceId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM Deployment WHERE id = ${snapshot.id} FOR UPDATE`);
    const current=await loadWork(snapshot.id,userId,rollback,tx);
    if(current.rootPath!==snapshot.rootPath||current.previousRootPath!==snapshot.previousRootPath||current.spaceId!==snapshot.spaceId)throw new VersionError(409,"作品已发生变化，请刷新后重试");
    const changed=await tx.deployment.updateMany({where:{id:current.id,rootPath:snapshot.rootPath,previousRootPath:snapshot.previousRootPath,spaceId:snapshot.spaceId,deletedAt:null},data:{rootPath:newRoot,previousRootPath:current.rootPath}});
    if(changed.count!==1)throw new VersionError(409,"作品已发生变化，请刷新后重试");
    return {id:current.id,publicSlug:current.publicSlug,hasPreviousVersion:true};
  });
}
async function cleanupUnused(root:string|null|undefined){
  if(!root)return;
  try{await removeDeploymentFolder(root);}catch(error){console.error("[versions] obsolete version cleanup failed",error);}
}
export async function replaceWorkFiles(id:string,userId:string,items:UploadItem[]){
  const snapshot=await loadWork(id,userId);
  validateItems(items);
  const relative=path.join("versions",id,randomSlug(18));
  let stagedRoot=path.join(config.uploadRoot,relative);
  let result;
  try{
    stagedRoot=await saveDeploymentFiles(relative,items);
    result=await commitRoots(snapshot,userId,stagedRoot,false);
  }catch(error){await cleanupUnused(stagedRoot);throw error;}
  await cleanupUnused(snapshot.previousRootPath);
  scheduleThumbnail(result.publicSlug);
  return result;
}
export async function rollbackWorkFiles(id:string,userId:string){
  const snapshot=await loadWork(id,userId,true);
  // Verify that the retained version still exists before changing the live pointer.
  try{await fs.access(path.join(snapshot.previousRootPath!,"index.html"));}catch{throw new VersionError(409,"上一版文件不存在，无法回退");}
  const result=await commitRoots(snapshot,userId,snapshot.previousRootPath!,true);
  scheduleThumbnail(result.publicSlug);
  return result;
}
const upload=multer({dest:os.tmpdir(),limits:{fileSize:20*1024*1024,files:1000}});
const fail=(res:Response,error:unknown)=>res.status(error instanceof VersionError?error.status:400).json({message:error instanceof VersionError?error.message:"文件更新失败，旧作品已保留"});
export function registerDeploymentVersionRoutes(router:Router){
  router.post("/:id/files",requireAuth,async(req:Request,res:Response,next:NextFunction)=>{
    try{await loadWork(String(req.params.id),req.authUser!.userId);next();}catch(error){fail(res,error);}
  },(req,res)=>{
    upload.array("files",1000)(req,res,async(error)=>{
      const files=(req.files as Express.Multer.File[])??[];
      try{
        if(error)throw error;
        if(files.reduce((sum,file)=>sum+file.size,0)>2000*1024*1024)throw new VersionError(400,"更新上传的文件总大小不得超过 2 GB");
        const paths=Array.isArray(req.body.paths)?req.body.paths:req.body.paths?[req.body.paths]:[];
        if(paths.length&&paths.length!==files.length)throw new VersionError(400,"文件路径数量不匹配");
        const result=await replaceWorkFiles(String(req.params.id),req.authUser!.userId,files.map((file,index)=>({file,relativePath:String(paths[index]??file.originalname)})));
        res.json(result);
      }catch(error){fail(res,error);}
      finally{await Promise.all(files.map(file=>fs.rm(file.path,{force:true}).catch(()=>{})));}
    });
  });
  router.post("/:id/rollback",requireAuth,async(req,res)=>{
    try{res.json(await rollbackWorkFiles(String(req.params.id),req.authUser!.userId));}catch(error){fail(res,error);}
  });
}
