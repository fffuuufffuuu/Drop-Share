import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config";
import { prisma } from "./db";
import { AuthError, cloudbaseEnabled, getCloudbaseUser } from "./cloudbase";
import type { AuthUser } from "./types";

export async function resolveAuthUser(token: string): Promise<AuthUser> {
  if (!cloudbaseEnabled()) {
    if (config.authProvider !== "legacy") throw new AuthError("认证配置错误", 503);
    return z.object({ userId: z.string(), username: z.string() }).parse(jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }));
  }
  const profile = await getCloudbaseUser(token);
  const user = await prisma.user.findUnique({ where: { cloudbaseEnvId_cloudbaseSubject: { cloudbaseEnvId: config.cloudbaseEnvId, cloudbaseSubject: profile.sub } } });
  if (!user || user.cloudbaseSubject!==profile.sub || user.cloudbaseEnvId!==config.cloudbaseEnvId) throw new AuthError("Invalid token", 401);
  return { userId: user.id, username: user.username };
}
