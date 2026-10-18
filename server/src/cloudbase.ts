import { z } from "zod";
import { config } from "./config";

export class AuthError extends Error {
  constructor(message: string, public status = 400, public code?:string) { super(message); }
}

export function cloudbaseEnabled(): boolean { return config.authProvider === "cloudbase"; }

// User APIs only. Never accept an endpoint or administrator credential from a request.
export async function cloudbaseRequest(path: string, body?: object, token?: string, captchaToken?:string): Promise<any> {
  if (!/^[a-z][a-z0-9-]{2,99}$/.test(config.cloudbaseEnvId)) {
    throw new AuthError("CloudBase 环境尚未配置", 503);
  }
  let response: Response;
  let data: any;
  try {
    response = await fetch(`https://${config.cloudbaseEnvId}.api.tcloudbasegateway.com/auth/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(captchaToken?{"x-captcha-token":captchaToken}:{}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    data = await response.json();
  } catch { throw new AuthError("认证服务暂不可用，请稍后重试", 503); }
  if (!response.ok || data.error) {
    const messages: Record<string, string> = {
      invalid_verification_code: "验证码错误或已过期，请重新获取",
      verification_not_found: "验证码已过期，请重新获取",
      rate_limit_exceeded: "发送过于频繁，请稍后重试",
      resource_exhausted: "请求过于频繁，请稍后重试",
      captcha_required: "请完成图形验证后重新获取验证码",
      unimplemented: "该认证方式尚未配置完成，请联系管理员",
      invalid_grant: "登录已过期，请重新登录",
    };
    const limited = response.status === 429 || ["resource_exhausted", "rate_limit_exceeded"].includes(data.error);
    throw new AuthError(messages[data.error] ?? "身份验证失败，请重试", limited ? 429 : response.status >= 500 ? 503 : 400,data.error);
  }
  return data;
}

const profileSchema = z.object({
  sub: z.string().min(1).max(128).refine(v => v !== "service_account"),
  email: z.string().email().optional(),
  phone_number: z.string().optional(),
  status: z.literal("ACTIVE"),
});

export async function getCloudbaseUser(token: string) {
  const profile = profileSchema.safeParse(await cloudbaseRequest("/user/me", undefined, token));
  if (!profile.success) throw new AuthError("Invalid token", 401);
  return profile.data;
}

export const cloudbaseSessionSchema = z.object({
  access_token: z.string().min(1).max(8192), refresh_token: z.string().min(1).max(4096),
  expires_in: z.number().int().positive(), sub: z.string().min(1).max(128),
});
