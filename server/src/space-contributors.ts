import {Prisma} from "@prisma/client";
import type {Router} from "express";
import {z} from "zod";
import {prisma} from "./db";
import {requireAuth} from "./middleware";
import {canManageSpace} from "./space-permissions";
import {isExpired} from "./retention";

// Serialize role changes with file-version commits in the same space.
export async function lockSpace(tx:Prisma.TransactionClient,spaceId:string){
  await tx.$queryRaw(Prisma.sql`SELECT id FROM Space WHERE id = ${spaceId} FOR UPDATE`);
}
export function registerSpaceContributorRoutes(router:Router){
  router.get("/:id/contributors",async(req,res)=>{
    res.setHeader("Cache-Control","no-store");
    const space=await prisma.space.findUnique({where:{id:String(req.params.id)}});
    if(!space||isExpired(space.expiresAt)){res.status(404).json({message:"空间不存在或已过期"});return;}
    const [groups,admins]=await Promise.all([
      prisma.deployment.groupBy({by:["ownerUserId"],where:{spaceId:space.id,deletedAt:null},_count:{_all:true},_sum:{viewCount:true}}),
      prisma.spaceAdministrator.findMany({where:{spaceId:space.id},select:{userId:true}}),
    ]);
    const ids=Array.from(new Set([space.ownerUserId,...admins.map(a=>a.userId),...groups.flatMap(g=>g.ownerUserId?[g.ownerUserId]:[])]));
    const users=await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,username:true}});
    const adminIds=new Set(admins.map(a=>a.userId));
    const contributors:Array<{userId:string|null;username:string;workCount:number;viewCount:number;role:string}>=users.map(user=>({
      userId:user.id,username:user.username,workCount:groups.find(g=>g.ownerUserId===user.id)?._count._all??0,
      viewCount:groups.find(g=>g.ownerUserId===user.id)?._sum?.viewCount??0,
      role:user.id===space.ownerUserId?"creator":adminIds.has(user.id)?"admin":"contributor",
    }));
    contributors.sort((a,b)=>(a.role==="creator"?-1:b.role==="creator"?1:a.role==="admin"&&b.role!=="admin"?-1:b.role==="admin"&&a.role!=="admin"?1:b.workCount-a.workCount));
    const anonymous=groups.find(g=>g.ownerUserId===null)?._count._all??0;
    if(anonymous)contributors.push({userId:null,username:"匿名",workCount:anonymous,viewCount:groups.find(g=>g.ownerUserId===null)?._sum?.viewCount??0,role:"contributor"});
    res.json({contributors});
  });
  router.get("/:id/permissions",requireAuth,async(req,res)=>{
    const space=await prisma.space.findUnique({where:{id:String(req.params.id)}});
    if(!space){res.status(404).json({message:"空间不存在"});return;}
    const isOwner=space.ownerUserId===req.authUser!.userId;
    res.json({isOwner,canManageAdmins:isOwner,canManage:!isExpired(space.expiresAt)&&await canManageSpace(space,req.authUser!.userId)});
  });
  router.put("/:id/administrators/:userId",requireAuth,async(req,res,next)=>{
    const parsed=z.object({enabled:z.boolean()}).safeParse(req.body);
    if(!parsed.success){res.status(400).json({message:"管理员权限值无效"});return;}
    try{
      const result=await prisma.$transaction(async tx=>{
        const id=String(req.params.id),userId=String(req.params.userId);
        await lockSpace(tx,id);
        const space=await tx.space.findUnique({where:{id}});
        if(!space)return {status:404,message:"空间不存在"};
        if(space.ownerUserId!==req.authUser!.userId)return {status:403,message:"只有创建者可以设置空间管理员"};
        if(userId===space.ownerUserId)return {status:400,message:"创建者权限不能修改"};
        if(parsed.data.enabled){
          if(isExpired(space.expiresAt))return {status:410,message:"空间已过期"};
          const contribution=await tx.deployment.findFirst({where:{spaceId:id,ownerUserId:userId,deletedAt:null},select:{id:true}});
          if(!contribution)return {status:400,message:"只能将当前空间的已注册贡献者设为管理员"};
          const existing = await tx.spaceAdministrator.findUnique({ where: { spaceId_userId: { spaceId: id, userId } } });
          await tx.spaceAdministrator.upsert({where:{spaceId_userId:{spaceId:id,userId}},create:{spaceId:id,userId},update:{}});
          if (!existing) await tx.notification.create({ data: { recipientId: userId, kind: "space_admin",
            title: `你已成为“${space.name}”的管理员`.slice(0, 255),
            content: `你现在可以管理“${space.name}”中的作品：更新上传和退回上一版、重命名、隐藏或恢复显示、删除作品、管理标签、编辑作品简介及评论，并可延长有效空间的期限。你可以下载空间作品和管理公开下载开关，公开下载受该开关控制。授予/撤销管理员、删除和合并空间仍仅由创建者操作。`,
            href: `/s/${encodeURIComponent(space.slug)}`,
          } });
        }else await tx.spaceAdministrator.deleteMany({where:{spaceId:id,userId}});
        return {status:200,message:parsed.data.enabled?"已设为空间管理员":"已撤销空间管理员权限"};
      });
      res.status(result.status).json({message:result.message});
    }catch(error){next(error);}
  });
}
