import { Router } from "express";
import fs from "node:fs/promises";
import { thumbnailCache as cache, loadThumbnail as load, loadManagedThumbnail, prepareThumbnail } from "./thumbnail-service";
import { requireAuth } from "./middleware";

export const thumbnailRouter = Router();
thumbnailRouter.get("/:slug/thumbnail/private", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store"); res.vary("Authorization"); next();
}, requireAuth, async (req, res) => {
  const result = await loadManagedThumbnail(String(req.params.slug), req.authUser!.userId);
  if (!result) { res.status(404).end(); return; }
  const file = cache.file(result.work.id, result.version);
  try { await fs.access(file); } catch { res.status(404).end(); return; }
  res.sendFile(file, { dotfiles: "allow", cacheControl: false, etag: false, lastModified: false });
});
thumbnailRouter.get("/:slug/thumbnail", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const thumbnail = await prepareThumbnail(String(req.params.slug));
  if (!("version" in thumbnail)) { res.status(404).json({ status: "unavailable" }); return; }
  if (thumbnail.status === "ready") { res.json({ status: "ready", version: thumbnail.version }); return; }
  res.setHeader("Retry-After", thumbnail.status === "pending" ? "3" : "300");
  res.status(thumbnail.status === "pending" ? 202 : 503).json({ status: thumbnail.status });
});

thumbnailRouter.get("/:slug/thumbnail/image", async (req, res) => {
  const result = await load(String(req.params.slug));
  if (!result) { res.status(404).end(); return; }
  if (req.query.version !== result.version) { res.setHeader("Cache-Control", "no-store"); res.status(409).end(); return; }
  const file = cache.file(result.work.id, result.version);
  try { await fs.access(file); } catch { res.setHeader("Cache-Control", "no-store"); res.status(404).end(); return; }
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("ETag", `"webp-v1-${result.version}"`);
  // The cache is dot-prefixed; only this availability-checked, server-derived file is served.
  res.sendFile(file, { dotfiles: "allow" });
});
