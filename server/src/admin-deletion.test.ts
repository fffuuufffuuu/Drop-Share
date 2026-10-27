import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  permanentlyDeleteDeployment,
  permanentlyDeleteSpace,
} from "./admin-deletion";
import { prisma } from "./db";
import { removeDeploymentFolder } from "./storage";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update:vi.fn(),updateMany:vi.fn(),
    },
    space: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update:vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw:vi.fn(),
  },
}));

vi.mock("./storage", () => ({
  removeDeploymentFolder: vi.fn(),
}));

describe("permanent admin deletion", () => {
  it("does not remove any files if the tombstone transaction fails",async()=>{
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({id:"d1",rootPath:"current",previousRootPath:"previous"} as any);
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(permanentlyDeleteDeployment("d1")).rejects.toThrow("database unavailable");
    expect(removeDeploymentFolder).not.toHaveBeenCalled();expect(prisma.deployment.delete).not.toHaveBeenCalled();
  });
  it("does slow file removal outside the database transaction",async()=>{
    let inTransaction=false;
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({id:"d1",rootPath:"current"} as any);
    vi.mocked(prisma.$transaction).mockImplementation((async(fn:any)=>{inTransaction=true;try{return await fn(prisma);}finally{inTransaction=false;}}) as any);
    vi.mocked(removeDeploymentFolder).mockImplementation(async()=>{expect(inTransaction).toBe(false);});
    await expect(permanentlyDeleteDeployment("d1")).resolves.toBe("deleted");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(removeDeploymentFolder).mockResolvedValue();
    vi.mocked(prisma.deployment.delete).mockResolvedValue({} as never);
    vi.mocked(prisma.deployment.deleteMany).mockReturnValue({ kind: "delete-deployments" } as never);
    vi.mocked(prisma.space.delete).mockReturnValue({ kind: "delete-space" } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async(fn:any)=>fn(prisma));
  });

  it("removes deployment files before permanently deleting the row", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({
      id: "d1",
      rootPath: "storage/d1",
      previousRootPath:"storage/previous-d1",
    } as never);

    await expect(permanentlyDeleteDeployment("d1")).resolves.toBe("deleted");

    expect(removeDeploymentFolder).toHaveBeenCalledWith("storage/d1");
    expect(removeDeploymentFolder).toHaveBeenCalledWith("storage/previous-d1");
    expect(vi.mocked(removeDeploymentFolder).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(prisma.deployment.delete).mock.invocationCallOrder[0]);
    expect(prisma.deployment.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
  });

  it("keeps the deployment row when file removal fails", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({
      id: "d1",
      rootPath: "storage/d1",
    } as never);
    vi.mocked(removeDeploymentFolder).mockRejectedValue(new Error("磁盘清理失败"));

    await expect(permanentlyDeleteDeployment("d1")).rejects.toThrow("磁盘清理失败");

    expect(prisma.deployment.delete).not.toHaveBeenCalled();
  });

  it("returns not-found for an unknown deployment", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue(null);

    await expect(permanentlyDeleteDeployment("missing")).resolves.toBe("not-found");

    expect(removeDeploymentFolder).not.toHaveBeenCalled();
    expect(prisma.deployment.delete).not.toHaveBeenCalled();
  });

  it("removes every space folder before deleting records in one transaction", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      id: "s1",
      deployments: [
        { rootPath: "storage/s1/d1" },
        { rootPath: "storage/s1/d2" },
      ],
    } as never);

    await expect(permanentlyDeleteSpace("s1")).resolves.toBe("deleted");

    expect(removeDeploymentFolder).toHaveBeenNthCalledWith(1, "storage/s1/d1");
    expect(removeDeploymentFolder).toHaveBeenNthCalledWith(2, "storage/s1/d2");
    const lastFolderRemoval = vi.mocked(removeDeploymentFolder).mock.invocationCallOrder[1];
    expect(lastFolderRemoval)
      .toBeLessThan(vi.mocked(prisma.deployment.deleteMany).mock.invocationCallOrder[0]);
    expect(prisma.deployment.deleteMany).toHaveBeenCalledWith({where:{spaceId:"s1"}});
    expect(prisma.space.delete).toHaveBeenCalledWith({where:{id:"s1"}});
  });

  it("does not delete space records if any folder removal fails", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue({
      id: "s1",
      deployments: [
        { rootPath: "storage/s1/d1" },
        { rootPath: "storage/s1/d2" },
      ],
    } as never);
    vi.mocked(removeDeploymentFolder)
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("磁盘清理失败"));

    await expect(permanentlyDeleteSpace("s1")).rejects.toThrow("磁盘清理失败");

    expect(prisma.deployment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.space.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.space.update).toHaveBeenCalledWith({where:{id:"s1"},data:{expiresAt:new Date(0)}});
  });

  it("returns not-found for an unknown space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(null);

    await expect(permanentlyDeleteSpace("missing")).resolves.toBe("not-found");

    expect(removeDeploymentFolder).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
