import { prisma } from "./db";
export function profileAvatar(profile: { picture?: string | null }): string | null {
  try {
    const url = new URL(profile.picture ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export async function syncAvatar<T extends { id: string; avatarUrl?: string | null }>(user: T, profile: { picture?: string | null }): Promise<T> {
  const avatarUrl = profileAvatar(profile);
  if ((user.avatarUrl ?? null) === avatarUrl) return user;
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
  return { ...user, avatarUrl };
}
