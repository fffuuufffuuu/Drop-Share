import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "./db";
import { canManageSpace, workCapabilities } from "./space-permissions";
vi.mock("./db", () => ({prisma:{spaceAdministrator:{findUnique:vi.fn()},user:{findUnique:vi.fn()}}}));
const space={id:"space",ownerUserId:"creator",expiresAt:new Date("2099-01-01")};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(prisma.spaceAdministrator.findUnique).mockResolvedValue(null);vi.mocked(prisma.user.findUnique).mockResolvedValue(null);});
it("only delegates within the specified space, with creator privileges implicit",async()=>{
  expect(await canManageSpace(space,"creator")).toBe(true);
  expect(await canManageSpace(space,"visitor")).toBe(false);
  vi.mocked(prisma.spaceAdministrator.findUnique).mockResolvedValue({spaceId:"space",userId:"delegate"} as any);
  expect(await canManageSpace(space,"delegate")).toBe(true);
  expect(prisma.spaceAdministrator.findUnique).toHaveBeenLastCalledWith({where:{spaceId_userId:{spaceId:"space",userId:"delegate"}}});
});
it("uploader may update but only space managers may rollback",async()=>{
  const work={ownerUserId:"uploader",space,spaceId:space.id,deletedAt:null,expiresAt:space.expiresAt,previousRootPath:"previous"};
  expect(await workCapabilities(work,"uploader")).toEqual({canUpdate:true,canRollback:false,hasPreviousVersion:true});
  expect(await workCapabilities(work,"creator")).toEqual({canUpdate:true,canRollback:true,hasPreviousVersion:true});
  expect((await workCapabilities({...work,deletedAt:new Date()},"creator")).canUpdate).toBe(false);
});
it("lets personal work owners roll back when a previous version exists",async()=>{
  const work={ownerUserId:"owner",spaceId:null,deletedAt:null,expiresAt:new Date("2099-01-01"),previousRootPath:"previous"};
  expect(await workCapabilities(work,"owner")).toMatchObject({canUpdate:true,canRollback:true,hasPreviousVersion:true});
  expect(await workCapabilities(work,"stranger")).toMatchObject({canUpdate:false,canRollback:false});
});
it("site administrators can update without gaining space rollback privileges",async()=>{
  vi.mocked(prisma.user.findUnique).mockResolvedValue({role:"ADMIN"} as any);
  expect(await workCapabilities({ownerUserId:"uploader",space,spaceId:space.id,deletedAt:null,expiresAt:space.expiresAt,previousRootPath:"previous"},"site-admin")).toMatchObject({canUpdate:true,canRollback:false});
});
