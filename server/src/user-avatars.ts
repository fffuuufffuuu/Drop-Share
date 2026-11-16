import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { config } from "./config";
import { prisma } from "./db";
import { AuthError, cloudbaseRequest, getCloudbaseUser } from "./cloudbase";
import { profileAvatar } from "./avatar-profile";

const imageSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  data: z.string().min(4).max(2796204).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
const avatarRoot = () => path.join(config.uploadRoot, "avatars");
export const avatarRouter = Router();
avatarRouter.get("/:user/:file", (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(String(req.params.user)) || !/^[a-f0-9-]{36}\.webp$/.test(String(req.params.file))) { res.sendStatus(404); return; }
  res.set({ "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable", "Cross-Origin-Resource-Policy": "cross-origin" });
  res.sendFile(path.join(avatarRoot(), String(req.params.user), String(req.params.file)), error => { if (error && !res.headersSent) res.sendStatus(404); });
});

export async function saveAvatar(body: unknown, token: string, subject: string, userId: string) {
  const input = imageSchema.parse(body);
  const bytes = Buffer.from(input.data, "base64");
  if (bytes.toString("base64") !== input.data) throw new AuthError("图片编码无效");
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new AuthError("头像不能超过 2 MiB");
  let image: Buffer;
  try {
    const decoder = sharp(bytes, { limitInputPixels: 16_000_000, animated: false });
    const metadata = await decoder.metadata();
    const formats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
    if (metadata.format !== formats[input.mimeType]) throw new Error("type mismatch");
    image = await decoder.rotate().resize(256, 256, { fit: "cover", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new AuthError("请选择有效的 PNG、JPEG、WebP 或 GIF 图片"); }
  const directory = createHash("sha256").update(userId).digest("hex");
  const filename = `${randomUUID()}.webp`;
  const folder = path.join(avatarRoot(), directory);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, filename), image, { flag: "wx" });
  const avatarUrl = new URL(`/api/avatars/${directory}/${filename}`, config.baseUrl).href;
  // Serialize updates by this user. Files are immutable, including after replacement.
  // Retain files on ambiguous upstream errors: the profile may already reference them.
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`);
      await cloudbaseRequest("/user/basic/edit", { avatar_url: avatarUrl }, token);
      const confirmed = await getCloudbaseUser(token);
      if (confirmed.sub !== subject || profileAvatar(confirmed) !== avatarUrl) throw new Error("profile not confirmed");
      await tx.user.update({ where: { id: userId }, data: { avatarUrl } });
    }, { timeout: 30_000 });
  } catch {
    throw new AuthError("头像保存未确认，请重新加载账号资料后重试（云端资料会在下次登录或刷新时重新同步）", 503);
  }
  return { avatarUrl };
}
