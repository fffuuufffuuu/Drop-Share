import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { prisma } from "./db";
import { resolveCloudbaseAccount } from "./cloudbase-accounts";
vi.mock("./db", () => ({ prisma: { user: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() } } }));
vi.mock("bcryptjs", () => ({ compare: vi.fn(async (password: string) => password === "correct-password") }));
const old = { id: "old-user", username: "teacher", passwordHash: "hash", role: "ADMIN", cloudbaseSubject: null, cloudbaseEnvId: null };
const identity = { sub: "subject-1", status: "ACTIVE" as const, email: "a@example.com" };
beforeEach(() => { vi.clearAllMocks(); config.cloudbaseEnvId = "test-env"; });
describe("CloudBase account binding", () => {
  it("requires an explicit username instead of creating a generated one", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(resolveCloudbaseAccount(identity)).rejects.toMatchObject({ code: "username_required" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it("does not require a new username for an already mapped account", async () => {
    const mapped = { ...old, cloudbaseSubject: "subject-1", cloudbaseEnvId: "test-env" };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mapped as any);
    expect(await resolveCloudbaseAccount(identity)).toMatchObject({ id: old.id, username: "teacher" });
  });
  it("does not claim a same-name old user without their password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(old as any);
    await expect(resolveCloudbaseAccount(identity, { username: "teacher" })).rejects.toMatchObject({ status: 409 });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects incorrect legacy credentials", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(old as any);
    await expect(resolveCloudbaseAccount(identity, { legacyUsername: "teacher", legacyPassword: "wrong" })).rejects.toThrow("原用户名或密码错误");
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("binds with compare-and-set and preserves the existing administrator ID", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(old as any).mockResolvedValueOnce(old as any);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    expect(await resolveCloudbaseAccount(identity, { legacyUsername: "teacher", legacyPassword: "correct-password" })).toMatchObject({ id: "old-user", role: "ADMIN" });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: "old-user", cloudbaseSubject: null, cloudbaseEnvId: null }, data: { cloudbaseSubject: "subject-1", cloudbaseEnvId: "test-env" } });
  });
  it("does not overwrite a binding won by another request", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(old as any);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
    await expect(resolveCloudbaseAccount(identity, { legacyUsername: "teacher", legacyPassword: "correct-password" })).rejects.toMatchObject({ status: 409 });
  });
  it("creates a regular user without copying provider roles or maintaining a local password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await resolveCloudbaseAccount(identity, { username: "new_user" });
    expect(prisma.user.create).toHaveBeenCalledWith({ data: { username: "new_user", passwordHash: null, role: "USER", cloudbaseEnvId: "test-env", cloudbaseSubject: "subject-1" } });
  });
});
