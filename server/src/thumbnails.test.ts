import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ThumbnailCache } from "./thumbnails";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))); });
it("deduplicates requests, renders serially and serves cached images without rendering again", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-thumbnails-")); roots.push(root);
  let active = 0, peak = 0;
  const render = vi.fn(async (_url: string, output: string) => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 30));
    await fs.writeFile(output, "png"); active--;
  });
  const cache = new ThumbnailCache(root, render);
  const request = (version: string) => cache.request("work", version, "https://example.com/p/work/?preview=1");
  expect((await request("one")).status).toBe("pending");
  await request("one"); await request("two");
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
  await vi.waitFor(async () => expect((await request("two")).status).toBe("ready"));
  expect(peak).toBe(1);
  await request("two"); expect(render).toHaveBeenCalledTimes(2);
});
it("backs off after renderer failure instead of launching a browser on every request", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-thumbnails-")); roots.push(root);
  const render = vi.fn().mockRejectedValue(new Error("unavailable"));
  const cache = new ThumbnailCache(root, render);
  await cache.request("work", "v1", "https://example.com");
  await vi.waitFor(async () => expect((await cache.request("work", "v1", "https://example.com")).status).toBe("unavailable"));
  expect(render).toHaveBeenCalledTimes(1);
});

it("discards a screenshot if the work changes while rendering", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-thumbnails-")); roots.push(root);
  const cache = new ThumbnailCache(root, async (_url, output) => { await fs.writeFile(output, "old"); });
  await cache.request("work", "old", "https://example.com", async () => false);
  await cache.idle();
  await expect(fs.access(cache.file("work", "old"))).rejects.toThrow();
});
it("compresses screenshots to a smaller WebP without changing the desktop layout", async () => {
  const sharp = (await import("sharp")).default;
  const { compressThumbnail } = await import("./thumbnails");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-thumbnails-")); roots.push(root);
  const source = path.join(root, "source.png"), output = path.join(root, "result.webp");
  await sharp({ create: { width: 1200, height: 760, channels: 3, background: "#336699" } }).png().toFile(source);
  await compressThumbnail(source, output);
  const metadata = await sharp(output).metadata();
  expect(metadata.format).toBe("webp"); expect(metadata.width).toBe(640);
  expect((await fs.stat(output)).size).toBeLessThan((await fs.stat(source)).size);
});

it("converts an existing PNG without reopening the work webpage", async () => {
  const sharp = (await import("sharp")).default;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-thumbnails-")); roots.push(root);
  const render = vi.fn(); const cache = new ThumbnailCache(root, render);
  const legacy = cache.file("work", "v1").replace(/\.webp$/, ".png");
  await fs.mkdir(path.dirname(legacy), { recursive: true });
  await sharp({ create: { width: 1200, height: 760, channels: 3, background: "white" } }).png().toFile(legacy);
  await cache.request("work", "v1", "https://example.com"); await cache.idle();
  expect(render).not.toHaveBeenCalled();
  expect((await sharp(cache.file("work", "v1")).metadata()).format).toBe("webp");
  await expect(fs.access(legacy)).rejects.toThrow();
});
