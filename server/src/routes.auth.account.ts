import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config";
import { prisma } from "./db";
import { AuthError, cloudbaseEnabled, cloudbasePhone, cloudbaseRequest, getCloudbaseUser } from "./cloudbase";

export const cloudbaseAccountRouter = Router();
const methodSchema = z.enum(["sms", "email"]);
const codeSchema = z.string().regex(/^\d{6}$/);
const stringToken = z.string().min(1).max(8192);
const contactSchema = z.object({ sub: z.string(), envId: z.string(), method: methodSchema, identity: z.string(), verificationId: z.string() });
const proofSchema = z.object({ sub: z.string(), envId: z.string(), sudoToken: stringToken });
type Context = { token: string; profile: Awaited<ReturnType<typeof getCloudbaseUser>>; user: { id: string; username: string } };
function sign(data: object, audience: string, expiresIn = 600) { return jwt.sign({ ...data, envId: config.cloudbaseEnvId }, config.jwtSecret, { audience, expiresIn }); }
function decode(value: unknown, audience: string, sub: string) {
  const claim = jwt.verify(stringToken.parse(value), config.jwtSecret, { audience, algorithms: ["HS256"] });
  if (typeof claim === "string" || claim.sub !== sub || claim.envId !== config.cloudbaseEnvId) throw new AuthError("身份验证已失效，请重新验证");
  return claim;
}
function protectedRoute(fn: (req: Request, res: Response, context: Context) => Promise<void>) {
  return async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!cloudbaseEnabled()) throw new AuthError("CloudBase 认证未启用", 404);
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) throw new AuthError("Missing token", 401);
      const profile = await getCloudbaseUser(token);
      const user = await prisma.user.findUnique({ where: { cloudbaseEnvId_cloudbaseSubject: { cloudbaseEnvId: config.cloudbaseEnvId, cloudbaseSubject: profile.sub } } });
      if (!user || user.cloudbaseEnvId !== config.cloudbaseEnvId || user.cloudbaseSubject !== profile.sub) throw new AuthError("Invalid token", 401);
      await fn(req, res, { token, profile, user });
    } catch (error) {
      if (error instanceof AuthError) { res.status(error.status).json({ message: error.message, captchaRequired: error.code === "captcha_required" }); return; }
      res.status(400).json({ message: "操作失败，请检查输入或重新验证身份" });
    }
  };
}
function target(method: "sms" | "email", identity: string) { return method === "sms" ? { phone_number: cloudbasePhone(identity) } : { email: identity }; }
function identityFor(profile: Context["profile"], method: "sms" | "email") { return method === "sms" ? profile.phone_number?.replace(/\s/g, "") : profile.email?.toLowerCase(); }
function proofFor(req: Request, sub: string) { return proofSchema.parse(decode(req.body.proof, "cloudbase-account-proof", sub)); }

cloudbaseAccountRouter.get("/", protectedRoute(async (_req, res, { profile, user }) => {
  res.json({ username: user.username, loginUsername: profile.username ?? "", phone: profile.phone_number ?? "", email: profile.email ?? "" });
}));
cloudbaseAccountRouter.post("/proof/code", protectedRoute(async (req, res, { token, profile }) => {
  const method = methodSchema.parse(req.body.method);
  const identity = identityFor(profile, method);
  if (!identity) throw new AuthError("请使用已绑定的手机号或邮箱验证");
  const captchaToken = stringToken.optional().parse(req.body.captchaToken);
  const data = z.object({ verification_id: z.string().min(1), expires_in: z.number().positive() }).parse(await cloudbaseRequest("/verification", { ...target(method, identity), target: "CUR_USER" }, token, captchaToken));
  res.json({ challenge: sign({ sub: profile.sub, verificationId: data.verification_id, method, identity }, "cloudbase-account-challenge", Math.min(data.expires_in, 600)) });
}));
cloudbaseAccountRouter.post("/proof/verify", protectedRoute(async (req, res, { token, profile }) => {
  const challenge = contactSchema.parse(decode(req.body.challenge, "cloudbase-account-challenge", profile.sub));
  if (identityFor(profile, challenge.method) !== challenge.identity) throw new AuthError("绑定信息已变化，请重新验证");
  const verification = z.object({ verification_token: stringToken }).parse(await cloudbaseRequest("/verification/verify", { verification_id: challenge.verificationId, verification_code: codeSchema.parse(req.body.code) }));
  const data = z.object({ sudo_token: stringToken }).parse(await cloudbaseRequest("/user/sudo", verification, token));
  res.json({ proof: sign({ sub: profile.sub, sudoToken: data.sudo_token }, "cloudbase-account-proof") });
}));
cloudbaseAccountRouter.post("/username", protectedRoute(async (req, res, { token, profile, user }) => {
  proofFor(req, profile.sub);
  const username = z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/).parse(req.body.username);
  const reserved = await prisma.user.findUnique({ where: { username } });
  if (reserved && reserved.id !== user.id) throw new AuthError("该用户名已被其他账号使用，请更换", 409);
  // The CloudBase login username and local display name are separate. Ownership stays on sub.
  if (profile.username !== username) await cloudbaseRequest("/user/basic/edit", { username }, token);
  const updated = await getCloudbaseUser(token);
  if (updated.sub !== profile.sub || updated.username !== username) throw new AuthError("用户名修改结果未确认，请刷新账号信息后重试", 409);
  res.json({ ok: true, loginUsername: username });
}));
cloudbaseAccountRouter.post("/password", protectedRoute(async (req, res, { token, profile }) => {
  const proof = proofFor(req, profile.sub);
  const password = z.string().min(8).max(64).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/).parse(req.body.password);
  await cloudbaseRequest("/user/password", { new_password: password, sudo_token: proof.sudoToken }, token, undefined, "PATCH");
  res.json({ ok: true });
}));
cloudbaseAccountRouter.post("/contact/code", protectedRoute(async (req, res, { token, profile }) => {
  proofFor(req, profile.sub);
  const method = methodSchema.parse(req.body.method);
  if (identityFor(profile, method)) throw new AuthError("此登录方式已绑定，无需重复绑定");
  const raw = z.string().trim().parse(req.body.identity);
  const identity = method === "email" ? z.string().email().max(254).parse(raw.toLowerCase()) : z.string().regex(/^\+861[3-9]\d{9}$/).parse(raw.replace(/\s/g, "").replace(/^(1\d{10})$/, "+86$1"));
  const captchaToken = stringToken.optional().parse(req.body.captchaToken);
  const data = z.object({ verification_id: z.string().min(1), expires_in: z.number().positive() }).parse(await cloudbaseRequest("/verification", { ...target(method, identity), target: "ANY" }, token, captchaToken));
  res.json({ challenge: sign({ sub: profile.sub, verificationId: data.verification_id, method, identity }, "cloudbase-contact-challenge", Math.min(data.expires_in, 600)) });
}));
cloudbaseAccountRouter.post("/contact/verify", protectedRoute(async (req, res, { token, profile }) => {
  const proof = proofFor(req, profile.sub);
  const challenge = contactSchema.parse(decode(req.body.challenge, "cloudbase-contact-challenge", profile.sub));
  if (identityFor(profile, challenge.method)) throw new AuthError("此登录方式已绑定，无需重复绑定");
  const verification = z.object({ verification_token: stringToken }).parse(await cloudbaseRequest("/verification/verify", { verification_id: challenge.verificationId, verification_code: codeSchema.parse(req.body.code) }));
  await cloudbaseRequest("/user/contact", { ...target(challenge.method, challenge.identity), verification_token: verification.verification_token, sudo_token: proof.sudoToken, conflict_resolution: "DEFAULT" }, token, undefined, "PATCH");
  const updated = await getCloudbaseUser(token);
  if (updated.sub !== profile.sub || identityFor(updated, challenge.method) !== challenge.identity) throw new AuthError("绑定结果未确认，请重新登录检查", 409);
  res.json({ ok: true });
}));
