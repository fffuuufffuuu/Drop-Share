import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config";
import { prisma } from "./db";
import { AuthError, getCloudbaseUser } from "./cloudbase";
import { emailSchema, phoneSchema, registrationSchema, sendRegistrationCode, registerVerifiedEmail } from "./email-registration";

const sourceSchema = z.object({ userId: z.string().min(1), oldSubject: z.string().min(1), oldUsername: z.string(), phone: phoneSchema, email: emailSchema, envId: z.string(), approvedUntil: z.number().int().positive().optional() });
type Source = z.infer<typeof sourceSchema>;
const challengeSchema = sourceSchema.extend({ verificationId: z.string().min(1) });
const sign = (payload: object, audience: string, expiresIn: number) => jwt.sign({ ...payload, envId: config.cloudbaseEnvId }, config.jwtSecret, { audience, expiresIn });
function decode(token: string, audience: string) {
  const proof = sourceSchema.extend({ exp: z.number().int().positive() }).parse(jwt.verify(token, config.jwtSecret, { audience, algorithms: ["HS256"] }));
  if (proof.envId !== config.cloudbaseEnvId) throw new AuthError("迁移凭证已失效，请重新核实身份", 401);
  const { exp, ...source } = proof;
  return { ...source, approvedUntil: exp };
}
async function currentSource(source: Source) {
  if (source.approvedUntil && source.approvedUntil <= Math.floor(Date.now() / 1000)) throw new AuthError("迁移授权已过期，请重新向管理员核实身份", 401);
  const user = await prisma.user.findUnique({ where: { id: source.userId } });
  if (!user || user.cloudbaseEnvId !== source.envId || user.cloudbaseSubject !== source.oldSubject || user.username !== source.oldUsername) throw new AuthError("原账号状态已变化或迁移码已使用，请重新核实身份", 409);
  return user;
}
async function authorizeSource(req: Request, phone: string, email: string): Promise<Source> {
  if (req.body.recoveryToken) {
    const source = decode(z.string().max(8192).parse(req.body.recoveryToken), "account-migration-approval");
    if (source.phone !== phone || source.email !== email) throw new AuthError("手机号或新邮箱与迁移凭证不一致", 401);
    await currentSource(source);
    return source;
  }
  const accessToken = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!accessToken) throw new AuthError("请使用原账号的登录状态，或向管理员申请迁移码；不能仅凭手机号关联账号", 401);
  const profile = await getCloudbaseUser(accessToken);
  if (phoneSchema.safeParse(profile.phone_number).data !== phone) throw new AuthError("手机号与当前登录账号不一致", 401);
  const user = await prisma.user.findUnique({ where: { cloudbaseEnvId_cloudbaseSubject: { cloudbaseEnvId: config.cloudbaseEnvId, cloudbaseSubject: profile.sub } } });
  if (!user || user.cloudbaseEnvId !== config.cloudbaseEnvId || user.cloudbaseSubject !== profile.sub) throw new AuthError("Invalid token", 401);
  return { userId: user.id, oldSubject: profile.sub, oldUsername: user.username, phone, email, envId: config.cloudbaseEnvId };
}
export function registerMigrationRoutes(router: Router, replyError: (res: Response, error: unknown) => void) {
  router.post("/migration/code", async (req, res) => {
    try {
      const email = emailSchema.parse(req.body.email), phone = phoneSchema.parse(req.body.phone);
      const source = await authorizeSource(req, phone, email);
      const sent = await sendRegistrationCode(email, z.string().max(8192).optional().parse(req.body.captchaToken));
      const expiresIn = Math.min(sent.expiresIn, source.approvedUntil ? Math.max(1, source.approvedUntil - Math.floor(Date.now() / 1000)) : sent.expiresIn);
      res.json({ challenge: sign({ ...source, verificationId: sent.verificationId }, "account-migration-email", expiresIn), expiresIn });
    } catch (error) { replyError(res, error); }
  });
  router.post("/migration/verify", async (req, res) => {
    try {
      const input = registrationSchema.parse(req.body);
      const raw = jwt.verify(input.challenge, config.jwtSecret, { audience: "account-migration-email", algorithms: ["HS256"] });
      const source = challengeSchema.parse(raw);
      if (source.envId !== config.cloudbaseEnvId) throw new AuthError("迁移验证已过期", 401);
      await currentSource(source);
      const occupied = await prisma.user.findUnique({ where: { username: input.username } });
      if (occupied && occupied.id !== source.userId) throw new AuthError("用户名已被使用，请更换后重试", 409);
      const { session, profile } = await registerVerifiedEmail(source.email, source.verificationId, input);
      if (profile.sub === source.oldSubject) throw new AuthError("不能重复使用原身份迁移", 409);
      const user = await prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${source.userId} FOR UPDATE`);
        const changed = await tx.user.updateMany({
          where: { id: source.userId, username: source.oldUsername, cloudbaseEnvId: source.envId, cloudbaseSubject: source.oldSubject },
          data: { username: input.username, cloudbaseSubject: profile.sub },
        });
        if (changed.count !== 1) throw new AuthError("原账号已发生变化，迁移未完成，请联系管理员核实", 409);
        const migrated = await tx.user.findUnique({ where: { id: source.userId } });
        if (!migrated) throw new AuthError("原账号不存在", 409);
        return migrated;
      });
      console.info("[account-migration] completed", { userId: user.id });
      res.json({ token: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in, user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt } });
    } catch (error) { replyError(res, error); }
  });
}

// Mounted after the existing requireAuth + requireAdmin middleware.
export function registerMigrationAdminRoutes(router: Router) {
  router.post("/account-migrations", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (config.authProvider !== "cloudbase") throw new AuthError("CloudBase 认证未启用", 404);
      const input = z.object({ username: z.string().trim().min(2).max(32), phone: phoneSchema, email: emailSchema, confirmed: z.literal(true) }).parse(req.body);
      const user = await prisma.user.findUnique({ where: { username: input.username } });
      if (!user || user.cloudbaseEnvId !== config.cloudbaseEnvId || !user.cloudbaseSubject) throw new AuthError("没有可迁移的原账号，请核对原昵称和 CloudBase 身份", 404);
      if (user.phone && phoneSchema.safeParse(user.phone).data !== input.phone) throw new AuthError("手机号与原账号记录不一致", 409);
      const expiresIn = 900;
      const recoveryToken = sign({ userId: user.id, oldSubject: user.cloudbaseSubject, oldUsername: user.username, phone: input.phone, email: input.email }, "account-migration-approval", expiresIn);
      console.info("[account-migration] approved", { administratorId: req.authUser!.userId, userId: user.id });
      res.json({ recoveryToken, expiresIn });
    } catch (error) {
      res.status(error instanceof AuthError ? error.status : 400).json({ message: error instanceof AuthError ? error.message : "请核对原账号昵称、手机号、新邮箱并确认已人工核实身份" });
    }
  });
}
