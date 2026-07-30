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
    },
    space: {
      delete: vi.fn(),
      findMany: vi.fn(),
    },
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
    vi.mocked(prisma.space.findMany).mockResolvedValue([{
      id: "s1",
      deployments: [
        { id: "d1", rootPath: "storage/spaces/s1/d1" },
        { id: "d2", rootPath: "storage/spaces/s1/d2" },
      ],
    }] as never);

    await cleanupExpiredContent(now);

    expect(removeDeploymentFolder).toHaveBeenCalledTimes(2);
    expect(prisma.deployment.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(prisma.deployment.delete).toHaveBeenCalledWith({ where: { id: "d2" } });
    expect(prisma.space.delete).not.toHaveBeenCalled();
  });

  it("does not delete a space deployment record when folder removal fails", async () => {
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
});
