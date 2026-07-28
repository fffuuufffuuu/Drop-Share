import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "./db";
import { requireAdmin } from "./middleware";

vi.mock("./db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe("requireAdmin", () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a database-backed ADMIN", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: "ADMIN" } as never);
    const req = { authUser: { userId: "u1", username: "fffuuu" } } as Request;

    await requireAdmin(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { role: true },
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a database-backed USER", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: "USER" } as never);
    const req = { authUser: { userId: "u1", username: "member" } } as Request;

    await requireAdmin(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ message: "仅管理员可访问" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a request without an authenticated user", async () => {
    await requireAdmin({} as Request, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ message: "请先登录" });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
