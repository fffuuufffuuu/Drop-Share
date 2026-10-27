import {afterEach,beforeEach,expect,it,vi} from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {config} from "./config";
import {prisma} from "./db";
import {replaceWorkFiles,rollbackWorkFiles} from "./deployment-versions";
vi.mock("./db",()=>({prisma:{deployment:{findUnique:vi.fn(),updateMany:vi.fn()},spaceAdministrator:{findUnique:vi.fn()},user:{findUnique:vi.fn()},$transaction:vi.fn(),$queryRaw:vi.fn()}}));
let root="",originalRoot="",originalUploadRoot=config.uploadRoot;
let state:any;
beforeEach(async()=>{
  vi.resetAllMocks();root=await fs.mkdtemp(path.join(os.tmpdir(),"drop-version-storage-"));config.uploadRoot=root;
  originalRoot=path.join(root,"initial");await fs.mkdir(originalRoot);await fs.writeFile(path.join(originalRoot,"index.html"),"version A");
  state={id:"work",title:"original title",publicSlug:"fixed-url",viewCount:71,ownerUserId:"uploader",spaceId:"space",space:{id:"space",ownerUserId:"creator",expiresAt:new Date("2099-01-01")},expiresAt:new Date("2099-01-01"),createdAt:new Date("2026-01-01"),visibility:"hidden",deletedAt:null,rootPath:originalRoot,previousRootPath:null,tags:[{tagId:"original-tag"}]};
  vi.mocked(prisma.deployment.findUnique).mockImplementation((async()=>({...state})) as any);
  vi.mocked(prisma.deployment.updateMany).mockImplementation((async({where,data}:any)=>{if(state.rootPath!==where.rootPath||state.previousRootPath!==where.previousRootPath)return {count:0};Object.assign(state,data);return {count:1};}) as any);
  vi.mocked(prisma.$transaction).mockImplementation(async(fn:any)=>fn(prisma));
  vi.mocked(prisma.spaceAdministrator.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({role:"USER"} as any);
});
afterEach(async()=>{config.uploadRoot=originalUploadRoot;if(root)await fs.rm(root,{recursive:true,force:true});});
const upload=(html:string)=>[{file:{originalname:"updated.html",buffer:Buffer.from(html)} as Express.Multer.File,relativePath:"updated.html"}];
it("publishes new files at the same work identity and rolls back without losing views or metadata",async()=>{
  const metadata={...state};delete metadata.rootPath;delete metadata.previousRootPath;
  await replaceWorkFiles("work","uploader",upload("version B"));const rootB=state.rootPath;
  expect(await fs.readFile(path.join(rootB,"index.html"),"utf8")).toBe("version B");
  expect(await fs.readFile(path.join(originalRoot,"index.html"),"utf8")).toBe("version A");
  state.viewCount++;metadata.viewCount++;
  await rollbackWorkFiles("work","creator");
  expect(state.rootPath).toBe(originalRoot);expect(state.previousRootPath).toBe(rootB);
  await replaceWorkFiles("work","uploader",upload("version C"));
  await expect(fs.access(rootB)).rejects.toThrow();
  expect(await fs.readFile(path.join(state.previousRootPath,"index.html"),"utf8")).toBe("version A");
  const after={...state};delete after.rootPath;delete after.previousRootPath;expect(after).toEqual(metadata);
});
it("invalid folders and traversal attempts leave all live file references untouched",async()=>{
  for(const bad of ["../index.html","/index.html","assets/script.js"]){
    await expect(replaceWorkFiles("work","uploader",[{file:{buffer:Buffer.from("bad")} as any,relativePath:bad}])).rejects.toMatchObject({status:400});
  }
  expect(state.rootPath).toBe(originalRoot);expect(state.previousRootPath).toBeNull();
  expect(await fs.readFile(path.join(originalRoot,"index.html"),"utf8")).toBe("version A");
});
