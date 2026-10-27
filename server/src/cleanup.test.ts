import { beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupExpiredContent } from "./cleanup";
import { prisma } from "./db";
import { removeDeploymentFolder } from "./storage";

vi.mock("./db", () => ({
  prisma: {
    deployment: {
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      findUnique:vi.fn(),
    },
    space: {
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique:vi.fn(),
    },
    $transaction:vi.fn(),$queryRaw:vi.fn(),
  },
}));

vi.mock("./storage", () => ({
  removeDeploymentFolder: vi.fn(),
}));

const now = new Date("2026-07-30T01:00:00.000Z");

describe("expired content cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(prisma.deployment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.space.findMany).mockResolvedValue([]);
    vi.mocked(removeDeploymentFolder).mockResolvedValue();
    vi.mocked(prisma.$transaction).mockImplementation(async(fn:any)=>fn(prisma));
  });

  it("keeps space deployments out of personal expiration cleanup", async () => {
    await cleanupExpiredContent(now);

    expect(prisma.deployment.findMany).toHaveBeenCalledWith({
      where: {
        spaceId: null,
        deletedAt: null,
        expiresAt: { lte: now },
      },
    });
  });

  it("removes expired space files and records but keeps the space", async () => {
    vi.mocked(prisma.space.findUnique).mockImplementation((async()=>({...((await prisma.space.findMany({}))[0]),expiresAt:new Date("2020-01-01")})) as any);
    vi.mocked(prisma.space.findMany).mockResolvedValue([{
      id: "s1",
      deployments: [
        { id: "d1", rootPath: "storage/spaces/s1/d1",previousRootPath:"storage/versions/d1/previous" },
        { id: "d2", rootPath: "storage/spaces/s1/d2" },
      ],
    }] as never);

    await cleanupExpiredContent(now);

    expect(removeDeploymentFolder).toHaveBeenCalledTimes(3);
    expect(removeDeploymentFolder).toHaveBeenCalledWith("storage/versions/d1/previous");
    expect(prisma.deployment.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(prisma.deployment.delete).toHaveBeenCalledWith({ where: { id: "d2" } });
    expect(prisma.space.delete).not.toHaveBeenCalled();
  });

  it("does not delete a space deployment record when folder removal fails", async () => {
    vi.mocked(prisma.space.findUnique).mockImplementation((async()=>({...((await prisma.space.findMany({}))[0]),expiresAt:new Date("2020-01-01")})) as any);
    vi.mocked(prisma.space.findMany).mockResolvedValue([{
      id: "s1",
      deployments: [
        { id: "d1", rootPath: "storage/spaces/s1/d1" },
      ],
    }] as never);
    vi.mocked(removeDeploymentFolder).mockRejectedValueOnce(new Error("disk failure"));

    await cleanupExpiredContent(now);

    expect(prisma.deployment.delete).not.toHaveBeenCalled();
    expect(prisma.space.delete).not.toHaveBeenCalled();
  });
  it("rechecks expiration under the space lock and never removes works after renewal",async()=>{
    vi.mocked(prisma.space.findMany).mockResolvedValue([{id:"s1"}] as any);
    vi.mocked(prisma.space.findUnique).mockResolvedValue({expiresAt:new Date("2099-01-01"),deployments:[{id:"d1",rootPath:"current",previousRootPath:"previous"}]} as any);
    await cleanupExpiredContent(now);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(removeDeploymentFolder).not.toHaveBeenCalled();expect(prisma.deployment.delete).not.toHaveBeenCalled();
  });
});
