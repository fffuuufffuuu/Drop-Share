import express from "express";
import request from "supertest";
import {beforeEach,expect,it,vi} from "vitest";
import {prisma} from "./db";
import {registerSpaceContributorRoutes} from "./space-contributors";
vi.mock("./db",()=>({prisma:{space:{findUnique:vi.fn()},spaceAdministrator:{findUnique:vi.fn(),findMany:vi.fn(),upsert:vi.fn(),deleteMany:vi.fn()},deployment:{findFirst:vi.fn(),groupBy:vi.fn()},user:{findUnique:vi.fn(),findMany:vi.fn()},$transaction:vi.fn(),$queryRaw:vi.fn()}}));
vi.mock("./middleware",()=>({requireAuth:(req:any,res:any,next:any)=>{if(!req.headers.authorization)return res.status(401).json({message:"Missing token"});req.authUser={userId:req.headers.authorization};next();}}));
const app=express();app.use(express.json());const router=express.Router();registerSpaceContributorRoutes(router);app.use(router);
beforeEach(()=>{vi.resetAllMocks();vi.mocked(prisma.space.findUnique).mockResolvedValue({id:"s",ownerUserId:"owner",expiresAt:new Date("2099-01-01")} as any);vi.mocked(prisma.$transaction).mockImplementation(async(fn:any)=>fn(prisma));});
it("only creator can grant or revoke roles, including when caller is a delegate",async()=>{
  for(const actor of ["delegate","platform-admin","other"]){
    const response=await request(app).put("/s/administrators/member").set("Authorization",actor).send({enabled:true});
    expect(response.status).toBe(403);
  }
  expect(prisma.spaceAdministrator.upsert).not.toHaveBeenCalled();
});
it("grants a current contributor and never permits modifying the creator",async()=>{
  vi.mocked(prisma.deployment.findFirst).mockResolvedValue({id:"work"} as any);
  expect((await request(app).put("/s/administrators/member").set("Authorization","owner").send({enabled:true})).status).toBe(200);
  expect(prisma.spaceAdministrator.upsert).toHaveBeenCalledWith({where:{spaceId_userId:{spaceId:"s",userId:"member"}},create:{spaceId:"s",userId:"member"},update:{}});
  expect((await request(app).put("/s/administrators/owner").set("Authorization","owner").send({enabled:false})).status).toBe(400);
});
it("only grants to current contributors, but allows revoking an admin after their works are removed",async()=>{
  vi.mocked(prisma.deployment.findFirst).mockResolvedValue(null);
  expect((await request(app).put("/s/administrators/member").set("Authorization","owner").send({enabled:true})).status).toBe(400);
  expect((await request(app).put("/s/administrators/member").set("Authorization","owner").send({enabled:false})).status).toBe(200);
  expect(prisma.spaceAdministrator.deleteMany).toHaveBeenCalledWith({where:{spaceId:"s",userId:"member"}});
});
it("does not expose contact fields and combines anonymous contributions",async()=>{
  vi.mocked(prisma.deployment.groupBy).mockResolvedValue([{ownerUserId:"member",_count:{_all:2}},{ownerUserId:null,_count:{_all:3}}] as any);
  vi.mocked(prisma.spaceAdministrator.findMany).mockResolvedValue([]);
  vi.mocked(prisma.user.findMany).mockResolvedValue([{id:"owner",username:"creator",phone:"private"},{id:"member",username:"student",email:"private"}] as any);
  const response=await request(app).get("/s/contributors");
  expect(response.status).toBe(200);expect(response.body.contributors).toContainEqual({userId:null,username:"匿名",workCount:3,role:"contributor"});
  expect(JSON.stringify(response.body)).not.toMatch(/private|email|phone/);
});
