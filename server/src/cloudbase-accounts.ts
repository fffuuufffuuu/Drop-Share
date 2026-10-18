import { z } from "zod";
import { config } from "./config";
import { prisma } from "./db";
import { AuthError } from "./cloudbase";

export type AccountOptions = { username?: string; legacyUsername?: string; legacyPassword?: string };
export async function resolveCloudbaseAccount(profile: { sub: string }, options: AccountOptions = {}) {
  const identity = { cloudbaseEnvId: config.cloudbaseEnvId, cloudbaseSubject: profile.sub };
  const existing = await prisma.user.findUnique({ where: { cloudbaseEnvId_cloudbaseSubject: identity } });
  if(existing && (existing.cloudbaseSubject!==profile.sub || existing.cloudbaseEnvId!==config.cloudbaseEnvId)) throw new AuthError("认证身份不匹配",401);
  if (options.legacyUsername) {
    const legacy = await prisma.user.findUnique({ where: { username: options.legacyUsername } });
    const { compare } = await import("bcryptjs");
    // Compare against a fixed valid hash even when the user is missing, to avoid a fast lookup oracle.
    const hash = legacy?.passwordHash ?? "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    const valid = await compare(options.legacyPassword ?? "", hash);
    if (!legacy?.passwordHash || !valid) throw new AuthError("原用户名或密码错误");
    if (existing) {
      if (existing.id !== legacy.id) throw new AuthError("该登录身份已关联其他账号", 409);
      return existing;
    }
    if (legacy.cloudbaseSubject || legacy.cloudbaseEnvId) throw new AuthError("原账号已绑定登录身份", 409);
    const updated = await prisma.user.updateMany({ where: { id: legacy.id, cloudbaseSubject: null, cloudbaseEnvId: null }, data: identity });
    if (updated.count !== 1) throw new AuthError("账号绑定状态已变化，请重新登录", 409);
    const bound = await prisma.user.findUnique({ where: { id: legacy.id } });
    if (!bound) throw new AuthError("账号不存在", 401);
    return bound;
  }
  if (existing) return existing;
  const parsedUsername = z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/).safeParse(options.username);
  if (!parsedUsername.success) throw new AuthError("注册必须填写用户名，请填写后重新获取验证码", 400, "username_required");
  const username = parsedUsername.data;
  if (await prisma.user.findUnique({ where: { username } })) throw new AuthError("用户名已被占用；如为原账号，请选择关联旧账号", 409);
  return prisma.user.create({ data: { username, passwordHash: null, role: "USER", ...identity } });
}
