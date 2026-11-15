import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config";
import { prisma } from "./db";
import { AuthError, cloudbaseEnabled, cloudbaseRequest, cloudbaseSessionSchema, getCloudbaseUser } from "./cloudbase";
import { resolveCloudbaseAccount } from "./cloudbase-accounts";
import { cloudbaseAccountRouter } from "./routes.auth.account";
import { registerMigrationRoutes } from "./account-migration";
import { emailSchema, registrationSchema, sendRegistrationCode, registerVerifiedEmail } from "./email-registration";

export const cloudbaseAuthRouter = Router();
const limits = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "操作过于频繁，请稍后重试" } });
function replyError(res: import("express").Response, error: unknown) {
  if (error instanceof AuthError) { res.status(error.status).json({ message: error.message, captchaRequired:error.code==="captcha_required", usernameRequired:error.code==="username_required" }); return; }
  if ((error as any)?.code === "P2002") { res.status(409).json({ message: "该昵称或邮箱身份已关联账号，请重新登录" }); return; }
  res.status(400).json({ message: error instanceof z.ZodError ? error.issues[0]?.message ?? "请检查输入" : "认证失败，请重新获取验证码后重试" });
}
function sessionReply(res: import("express").Response, session: z.infer<typeof cloudbaseSessionSchema>, user: { id: string; username: string; role: string; createdAt: Date }) {
  res.json({ token: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in, user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt } });
}
cloudbaseAuthRouter.use(["/email/code", "/email/verify", "/sms/code", "/sms/verify", "/captcha", "/captcha/verify", "/refresh", "/logout", "/password/login", "/registration/complete", "/migration", "/account"], (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!cloudbaseEnabled()) { res.status(404).json({ message: "验证码认证未启用" }); return; }
  next();
}, limits);
cloudbaseAuthRouter.use("/account", cloudbaseAccountRouter);
registerMigrationRoutes(cloudbaseAuthRouter, replyError);
cloudbaseAuthRouter.post(["/sms/code", "/sms/verify", "/registration/complete"], (_req, res) => {
  res.status(410).json({ message: "短信登录和旧关联方式已停用，请使用邮箱注册、密码登录或关联旧账号" });
});

cloudbaseAuthRouter.post("/password/login", async (req, res) => {
  try {
    const input = z.object({ username: z.string().trim().min(2).max(254), password: z.string().min(1).max(100), captchaToken: z.string().min(1).max(8192).optional() }).parse(req.body);
    const email = emailSchema.safeParse(input.username);
    const username = email.success ? email.data : z.string().min(2).max(48).regex(/^[A-Za-z0-9][A-Za-z0-9_.:+ @-]+$/).parse(input.username);
    const session = cloudbaseSessionSchema.parse(await cloudbaseRequest("/signin", { username, password: input.password }, undefined, input.captchaToken));
    const profile = await getCloudbaseUser(session.access_token);
    if (profile.sub !== session.sub) throw new AuthError("认证身份不匹配，请重新登录", 401);
    sessionReply(res, session, await resolveCloudbaseAccount(profile));
  } catch (error) { replyError(res, error); }
});
cloudbaseAuthRouter.post("/captcha",async(_req,res)=>{
  try {
    const data=z.object({data:z.string().max(500000).regex(/^data:image\/(gif|png|jpeg);base64,[A-Za-z0-9+/=]+$/),token:z.string().min(1).max(8192)}).parse(await cloudbaseRequest("/captcha/data",{}));
    res.json(data);
  }catch(error){replyError(res,error);}
});
cloudbaseAuthRouter.post("/captcha/verify",async(req,res)=>{
  try{
    const input=z.object({token:z.string().min(1).max(8192),key:z.string().min(1).max(32)}).parse(req.body);
    const data=z.object({captcha_token:z.string().min(1).max(8192)}).parse(await cloudbaseRequest("/captcha/data/verify",input));
    res.json({captchaToken:data.captcha_token});
  }catch(error){replyError(res,error);}
});

cloudbaseAuthRouter.post("/email/code", async (req, res) => {
  try {
    const email = emailSchema.parse(req.body.email);
    const sent = await sendRegistrationCode(email, z.string().min(1).max(8192).optional().parse(req.body.captchaToken));
    const challenge = jwt.sign({ email, verificationId: sent.verificationId, envId: config.cloudbaseEnvId }, config.jwtSecret, { audience: "cloudbase-email-registration", expiresIn: sent.expiresIn });
    res.json({ challenge, expiresIn: sent.expiresIn });
  } catch (error) { replyError(res, error); }
});
cloudbaseAuthRouter.post("/email/verify", async (req, res) => {
  try {
    const input = registrationSchema.parse(req.body);
    const proof = z.object({ email: emailSchema, verificationId: z.string().min(1), envId: z.string() }).parse(jwt.verify(input.challenge, config.jwtSecret, { audience: "cloudbase-email-registration", algorithms: ["HS256"] }));
    if (proof.envId !== config.cloudbaseEnvId) throw new AuthError("验证码请求已失效，请重新获取");
    if (await prisma.user.findUnique({ where: { username: input.username } })) throw new AuthError("用户名已被使用，请更换后重试", 409);
    const { session, profile } = await registerVerifiedEmail(proof.email, proof.verificationId, input);
    sessionReply(res, session, await resolveCloudbaseAccount(profile, { username: input.username }));
  } catch (error) { replyError(res, error); }
});

cloudbaseAuthRouter.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1).max(4096) }).parse(req.body);
    const session = cloudbaseSessionSchema.parse(await cloudbaseRequest("/token", { grant_type: "refresh_token", refresh_token: refreshToken }));
    const profile = await getCloudbaseUser(session.access_token);
    if (profile.sub !== session.sub) throw new AuthError("Invalid token", 401);
    const user = await prisma.user.findUnique({ where: { cloudbaseEnvId_cloudbaseSubject: { cloudbaseEnvId: config.cloudbaseEnvId, cloudbaseSubject: profile.sub } } });
    if (!user || user.cloudbaseSubject!==profile.sub || user.cloudbaseEnvId!==config.cloudbaseEnvId) throw new AuthError("请重新登录并关联账号", 401);
    sessionReply(res, session, user);
  } catch (error) { replyError(res, error); }
});

cloudbaseAuthRouter.post("/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (token) await cloudbaseRequest("/user/signout", {}, token);
    res.json({ ok: true });
  } catch (error) { replyError(res, error); }
});
