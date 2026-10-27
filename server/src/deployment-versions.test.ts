import {beforeEach,expect,it,vi} from "vitest";
import {prisma} from "./db";
import {saveDeploymentFiles,removeDeploymentFolder} from "./storage";
import {workCapabilities} from "./space-permissions";
import {replaceWorkFiles,rollbackWorkFiles} from "./deployment-versions";
vi.mock("./db",()=>({prisma:{deployment:{findUnique:vi.fn(),updateMany:vi.fn()},$transaction:vi.fn(),$queryRaw:vi.fn()}}));
vi.mock("./storage",()=>({saveDeploymentFiles:vi.fn(),removeDeploymentFolder:vi.fn()}));
vi.mock("./space-permissions",()=>({workCapabilities:vi.fn()}));
vi.mock("./space-contributors",()=>({lockSpace:vi.fn()}));
vi.mock("node:fs/promises",()=>({default:{access:vi.fn().mockResolvedValue(undefined),rm:vi.fn().mockResolvedValue(undefined)}}));
const work={id:"work",publicSlug:"original-link",title:"original-name",viewCount:71,ownerUserId:"uploader",spaceId:"space",space:{id:"space",ownerUserId:"owner",expiresAt:new Date("2099-01-01")},rootPath:"old",previousRootPath:"older",deletedAt:null,expiresAt:new Date("2099-01-01")};
const files=[{file:{originalname:"index.html",buffer:Buffer.from("new")} as Express.Multer.File,relativePath:"index.html"}];
beforeEach(()=>{vi.resetAllMocks();vi.mocked(prisma.deployment.findUnique).mockResolvedValue(work as any);vi.mocked(prisma.deployment.updateMany).mockResolvedValue({count:1});vi.mocked(prisma.$transaction).mockImplementation(async(fn:any)=>fn(prisma));vi.mocked(workCapabilities).mockResolvedValue({canUpdate:true,canRollback:true,hasPreviousVersion:true});vi.mocked(saveDeploymentFiles).mockResolvedValue("new");});
it("only switches file paths, retaining the original URL, views and all metadata",async()=>{
  expect(await replaceWorkFiles("work","uploader",files)).toEqual({id:"work",publicSlug:"original-link",hasPreviousVersion:true});
  expect(prisma.deployment.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{rootPath:"new",previousRootPath:"old"},where:expect.objectContaining({rootPath:"old",previousRootPath:"older",deletedAt:null})}));
  expect(removeDeploymentFolder).toHaveBeenCalledWith("older");expect(removeDeploymentFolder).not.toHaveBeenCalledWith("old");
});
it("retains the old work when staging fails",async()=>{
  vi.mocked(saveDeploymentFiles).mockRejectedValue(new Error("bad upload"));
  await expect(replaceWorkFiles("work","uploader",files)).rejects.toThrow("bad upload");
  expect(prisma.deployment.updateMany).not.toHaveBeenCalled();expect(removeDeploymentFolder).not.toHaveBeenCalledWith("old");
});
it("rejects revoked permission and cleans the new files without deleting the previous work",async()=>{
  vi.mocked(workCapabilities).mockResolvedValueOnce({canUpdate:true,canRollback:false,hasPreviousVersion:true}).mockResolvedValueOnce({canUpdate:false,canRollback:false,hasPreviousVersion:true});
  await expect(replaceWorkFiles("work","delegate",files)).rejects.toMatchObject({status:403});
  expect(prisma.deployment.updateMany).not.toHaveBeenCalled();expect(removeDeploymentFolder).toHaveBeenCalledWith("new");
});
it("rejects a concurrent change instead of overwriting a newer commit",async()=>{
  vi.mocked(prisma.deployment.findUnique).mockResolvedValueOnce(work as any).mockResolvedValueOnce({...work,rootPath:"other-version"} as any);
  await expect(replaceWorkFiles("work","uploader",files)).rejects.toMatchObject({status:409});
  expect(removeDeploymentFolder).toHaveBeenCalledWith("new");expect(removeDeploymentFolder).not.toHaveBeenCalledWith("other-version");
});
it("rolls back by swapping roots and never changes metadata or deletes either retained version",async()=>{
  await rollbackWorkFiles("work","owner");
  expect(prisma.deployment.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{rootPath:"older",previousRootPath:"old"}}));
  expect(removeDeploymentFolder).not.toHaveBeenCalled();
});
it("denies rollback to an uploader without space management permissions",async()=>{
  vi.mocked(workCapabilities).mockResolvedValue({canUpdate:true,canRollback:false,hasPreviousVersion:true});
  await expect(rollbackWorkFiles("work","uploader")).rejects.toMatchObject({status:403});
  expect(prisma.deployment.updateMany).not.toHaveBeenCalled();
});
