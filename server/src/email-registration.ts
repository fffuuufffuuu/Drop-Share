import { z } from "zod";
import { AuthError, cloudbaseRequest, cloudbaseSessionSchema, getCloudbaseUser } from "./cloudbase";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
// A login name is distinct from an existing Chinese display nickname.
export const loginUsernameSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{4,23}$/, "用户名须为 5–24 位字母、数字、下划线、点或短横线，并以字母或数字开头");
export const passwordSchema = z.string().min(8).max(64).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, "密码须为 8–64 位，包含大小写字母、数字和特殊字符");
export const phoneSchema = z.string().trim().transform(value => value.replace(/\s/g, "").replace(/^(1\d{10})$/, "+86$1")).pipe(z.string().regex(/^\+861[3-9]\d{9}$/));
export const registrationSchema = z.object({
  challenge: z.string().min(1).max(16384), code: z.string().regex(/^\d{6}$/),
  username: loginUsernameSchema, password: passwordSchema,
});
export async function sendRegistrationCode(email: string, captchaToken?: string) {
  const payload = { email, target: "NON_USER" };
  const result = z.object({ verification_id: z.string().min(1), expires_in: z.number().positive(), is_user: z.boolean().optional() }).parse(
    await cloudbaseRequest("/verification", payload, undefined, captchaToken),
  );
  if (result.is_user) throw new AuthError("该邮箱已注册，请使用密码登录", 409);
  return { verificationId: result.verification_id, expiresIn: Math.min(result.expires_in, 600) };
}
export async function registerVerifiedEmail(email: string, verificationId: string, input: z.infer<typeof registrationSchema>) {
  const verification = z.object({ verification_token: z.string().min(1) }).parse(await cloudbaseRequest("/verification/verify", { verification_id: verificationId, verification_code: input.code }));
  const session = cloudbaseSessionSchema.parse(await cloudbaseRequest("/signup", { email, username: input.username, password: input.password, verification_token: verification.verification_token }));
  const profile = await getCloudbaseUser(session.access_token);
  if (profile.sub !== session.sub || profile.email?.toLowerCase() !== email || profile.username !== input.username) throw new AuthError("注册身份或登录用户名未确认，请联系管理员核实", 401);
  return { session, profile };
}
