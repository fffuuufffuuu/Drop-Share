import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import { config } from "./config";
import { isDeploymentAvailable } from "./deployment-access";
import { ThumbnailCache, thumbnailVersion } from "./thumbnails";
import { canManageSpace, isSiteAdministrator } from "./space-permissions";
import { isExpired } from "./retention";

export const thumbnailCache = new ThumbnailCache(path.join(config.uploadRoot, ".thumbnails"));
type Work = { id: string; publicSlug: string; rootPath: string; deletedAt: Date | null;
  visibility: string; expiresAt: Date; space?: { expiresAt: Date } | null };
export async function loadThumbnail(slug: string) {
  const work = await prisma.deployment.findUnique({ where: { publicSlug: slug }, include: { space: { select: { expiresAt: true } } } });
  if (!work || !isDeploymentAvailable(work)) return null;
  try {
    const stat = await fs.stat(path.join(work.rootPath, "index.html"));
    return { work, version: thumbnailVersion(work.rootPath, stat.mtimeMs, stat.size) };
  } catch { return null; }
}
// Hidden works never render through the public URL; authorized cards reuse an existing image.
export async function loadManagedThumbnail(slug: string, userId: string) {
  const work = await prisma.deployment.findUnique({ where: { publicSlug: slug }, include: { space: true } });
  if (!work || work.deletedAt || isExpired(work.space?.expiresAt ?? work.expiresAt)) return null;
  if (work.ownerUserId !== userId && !(work.space && await canManageSpace(work.space, userId)) && !await isSiteAdministrator(userId)) return null;
  try {
    const stat = await fs.stat(path.join(work.rootPath, "index.html"));
    return { work, version: thumbnailVersion(work.rootPath, stat.mtimeMs, stat.size) };
  } catch { return null; }
}
export async function prepareThumbnail(slug: string) {
  const result = await loadThumbnail(slug);
  if (!result) return { status: "unavailable" as const };
  const target = new URL(`/p/${encodeURIComponent(slug)}/?preview=1`, config.baseUrl).href;
  const thumbnail = await thumbnailCache.request(result.work.id, result.version, target,
    async () => (await loadThumbnail(slug))?.version === result.version);
  return { ...thumbnail, version: result.version };
}
// Never delay or fail an upload because its optional thumbnail cannot be prepared.
export function scheduleThumbnail(slug: string) {
  void prepareThumbnail(slug).catch(error => console.warn("[thumbnails] scheduling failed:", error instanceof Error ? error.message : "Unknown error"));
}
// List responses expose only a ready version, never a storage path or a render URL.
export async function readyThumbnailVersion(work: Work): Promise<string | undefined> {
  if (!work.rootPath || !isDeploymentAvailable({ ...work, space: work.space ?? null })) return undefined;
  try {
    const stat = await fs.stat(path.join(work.rootPath, "index.html"));
    const version = thumbnailVersion(work.rootPath, stat.mtimeMs, stat.size);
    await fs.access(thumbnailCache.file(work.id, version));
    return version;
  } catch { return undefined; }
}
// Page through existing works with backpressure; uploads and visible-card requests
// share the same serial queue. Disk caches make restarts and repeated sweeps cheap.
export async function backfillThumbnails() {
  let cursor: string | undefined;
  for (;;) {
    const works = await prisma.deployment.findMany({
      where: { deletedAt: null, visibility: "visible" }, orderBy: { id: "asc" }, take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, publicSlug: true },
    });
    if (!works.length) return;
    for (const work of works) {
      await prepareThumbnail(work.publicSlug);
      await thumbnailCache.idle();
    }
    cursor = works[works.length - 1].id;
  }
}
export function startThumbnailPreparation() {
  async function sweep() {
    try { await backfillThumbnails(); }
    catch (error) { console.warn("[thumbnails] backfill failed:", error instanceof Error ? error.message : "Unknown error"); }
    // Retry failures after cooldown and cover temporarily hidden or missed works.
    setTimeout(() => void sweep(), 5 * 60_000).unref();
  }
  void sweep();
}
