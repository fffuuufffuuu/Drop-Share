import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config";
import { prisma } from "./db";
import { AuthError, cloudbaseEnabled, cloudbasePhone, cloudbaseRequest, cloudbaseSessionSchema, getCloudbaseUser } from "./cloudbase";
import { resolveCloudbaseAccount } from "./cloudbase-accounts";
import { cloudbaseAccountRouter } from "./routes.auth.account";

export const cloudbaseAuthRouter = Router();
const limits = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "操作过于频繁，请稍后重试" } });
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const phoneSchema = z.string().trim().transform(v => v.replace(/\s/g, "").replace(/^(1\d{10})$/, "+86$1")).pipe(z.string().regex(/^\+861[3-9]\d{9}$/));
const usernameSchema = z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/);
const challengeSchema = z.object({ email: emailSchema.optional(), phone: phoneSchema.optional(), envId: z.string(), verificationId: z.string().min(1), isUser: z.boolean() });
function replyError(res: import("express").Response, error: unknown) {
  if (error instanceof AuthError) { res.status(error.status).json({ message: error.message, captchaRequired:error.code==="captcha_required", usernameRequired:error.code==="username_required" }); return; }
  if ((error as any)?.code === "P2002") { res.status(409).json({ message: "该用户名或邮箱身份已关联账号，请重新登录" }); return; }
  res.status(400).json({ message: "认证失败，请重新获取验证码后重试" });
}
function sessionReply(res: import("express").Response, session: z.infer<typeof cloudbaseSessionSchema>, user: { id: string; username: string; role: string; createdAt: Date }) {
  res.json({ token: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in, user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt } });
}
async function finishLogin(res: import("express").Response, session: z.infer<typeof cloudbaseSessionSchema>, profile: Awaited<ReturnType<typeof getCloudbaseUser>>, input: Parameters<typeof resolveCloudbaseAccount>[1]) {
  try { sessionReply(res, session, await resolveCloudbaseAccount(profile, input)); }
  catch (error) {
    if (!input?.legacyUsername && error instanceof AuthError && (error.code === "username_required" || error.status === 409)) {
      const registrationToken = jwt.sign({ session, envId: config.cloudbaseEnvId }, config.jwtSecret, { audience: "cloudbase-registration", expiresIn: 300 });
      res.status(400).json({ message: error.code === "username_required" ? "请填写用户名完成注册，无需重新获取验证码" : error.message, usernameRequired: true, registrationToken });
      return;
    }
    throw error;
  }
}
cloudbaseAuthRouter.use(["/email/code", "/email/verify", "/sms/code", "/sms/verify", "/captcha", "/captcha/verify", "/refresh", "/logout", "/password/login", "/registration/complete", "/account"], (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!cloudbaseEnabled()) { res.status(404).json({ message: "验证码认证未启用" }); return; }
  next();
}, limits);
cloudbaseAuthRouter.use("/account", cloudbaseAccountRouter);

cloudbaseAuthRouter.post("/password/login", async (req, res) => {
  try {
    const input = z.object({ username: z.string().trim().min(2).max(254), password: z.string().min(1).max(100), captchaToken: z.string().min(1).max(8192).optional() }).parse(req.body);
    const phone = phoneSchema.safeParse(input.username);
    const username = phone.success ? cloudbasePhone(phone.data) : emailSchema.safeParse(input.username).success ? input.username.toLowerCase() : input.username;
    const session = cloudbaseSessionSchema.parse(await cloudbaseRequest("/signin", { username, password: input.password }, undefined, input.captchaToken));
    const profile = await getCloudbaseUser(session.access_token);
    if (profile.sub !== session.sub) throw new AuthError("认证身份不匹配，请重新登录", 401);
    await finishLogin(res, session, profile, { username: profile.username });
  } catch (error) { replyError(res, error); }
});
cloudbaseAuthRouter.post("/registration/complete", async (req, res) => {
  try {
    const input = z.object({ registrationToken: z.string().min(1).max(32768), username: usernameSchema }).parse(req.body);
    const claim = z.object({ envId: z.string(), session: cloudbaseSessionSchema, iat: z.number().int().nonnegative() }).parse(jwt.verify(input.registrationToken, config.jwtSecret, { audience: "cloudbase-registration", algorithms: ["HS256"] }));
    if (claim.envId !== config.cloudbaseEnvId) throw new AuthError("注册验证已过期，请重新登录");
    const profile = await getCloudbaseUser(claim.session.access_token);
    if (profile.sub !== claim.session.sub) throw new AuthError("认证身份不匹配", 401);
    const user = await resolveCloudbaseAccount(profile, { username: input.username });
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - claim.iat);
    sessionReply(res, { ...claim.session, expires_in: Math.max(1, claim.session.expires_in - elapsed) }, user);
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

cloudbaseAuthRouter.post(["/email/code", "/sms/code"], async (req, res) => {
  try {
    const sms = req.path.startsWith("/sms/");
    const captchaToken=z.string().min(1).max(8192).optional().parse(req.body.captchaToken);
    const identity = sms ? { phone: phoneSchema.parse(req.body.phone) } : { email: emailSchema.parse(req.body.email) };
    const payload={ ...(sms ? { phone_number: cloudbasePhone(identity.phone!) } : { email: identity.email }), target: "ANY" };
    const result = z.object({ verification_id: z.string().min(1), expires_in: z.number().positive(), is_user: z.boolean().optional() }).parse(await (captchaToken?cloudbaseRequest("/verification",payload,undefined,captchaToken):cloudbaseRequest("/verification",payload)));
    const expiresIn = Math.min(result.expires_in, 600);
    const challenge = jwt.sign({ ...identity, verificationId: result.verification_id, isUser: result.is_user === true, envId: config.cloudbaseEnvId }, config.jwtSecret, { audience: sms ? "cloudbase-sms" : "cloudbase-email", expiresIn });
    res.json({ challenge, expiresIn, requiresUsername: result.is_user !== true });
  } catch (error) { replyError(res, error); }
});

cloudbaseAuthRouter.post(["/email/verify", "/sms/verify"], async (req, res) => {
  try {
    const input = z.object({ challenge: z.string().max(8192), code: z.string().regex(/^\d{6}$/), username: usernameSchema.optional(), legacyUsername: z.string().min(3).max(32).optional(), legacyPassword: z.string().min(8).max(100).optional() }).parse(req.body);
    if (!!input.legacyUsername !== !!input.legacyPassword) throw new AuthError("请同时填写原用户名和原密码");
    const sms = req.path.startsWith("/sms/");
    const proof = challengeSchema.parse(jwt.verify(input.challenge, config.jwtSecret, { audience: sms ? "cloudbase-sms" : "cloudbase-email", algorithms: ["HS256"] }));
    if (proof.envId !== config.cloudbaseEnvId || !(sms ? proof.phone : proof.email)) throw new AuthError("验证码请求已失效，请重新获取");
    if (!proof.isUser && !input.legacyUsername && !input.username) throw new AuthError("注册必须填写用户名", 400, "username_required");
    const verification = z.object({ verification_token: z.string().min(1) }).parse(await cloudbaseRequest("/verification/verify", { verification_id: proof.verificationId, verification_code: input.code }));
    const session = cloudbaseSessionSchema.parse(await cloudbaseRequest(proof.isUser ? "/signin" : "/signup", { ...(proof.isUser ? {} : sms ? { phone_number: cloudbasePhone(proof.phone!) } : { email: proof.email }), verification_token: verification.verification_token }));
    const profile = await getCloudbaseUser(session.access_token);
    const matches = sms ? profile.phone_number?.replace(/\s/g, "") === proof.phone : profile.email?.toLowerCase() === proof.email;
    if (profile.sub !== session.sub || !matches) throw new AuthError("认证身份不匹配，请重新登录", 401);
    await finishLogin(res, session, profile, input);
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
