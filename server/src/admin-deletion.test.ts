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
    },
    space: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("./storage", () => ({
  removeDeploymentFolder: vi.fn(),
}));

describe("permanent admin deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(removeDeploymentFolder).mockResolvedValue();
    vi.mocked(prisma.deployment.delete).mockResolvedValue({} as never);
    vi.mocked(prisma.deployment.deleteMany).mockReturnValue({ kind: "delete-deployments" } as never);
    vi.mocked(prisma.space.delete).mockReturnValue({ kind: "delete-space" } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  });

  it("removes deployment files before permanently deleting the row", async () => {
    vi.mocked(prisma.deployment.findUnique).mockResolvedValue({
      id: "d1",
      rootPath: "storage/d1",
    } as never);

    await expect(permanentlyDeleteDeployment("d1")).resolves.toBe("deleted");

    expect(removeDeploymentFolder).toHaveBeenCalledWith("storage/d1");
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
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { kind: "delete-deployments" },
      { kind: "delete-space" },
    ]);
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns not-found for an unknown space", async () => {
    vi.mocked(prisma.space.findUnique).mockResolvedValue(null);

    await expect(permanentlyDeleteSpace("missing")).resolves.toBe("not-found");

    expect(removeDeploymentFolder).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
