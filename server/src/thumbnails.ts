import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { thumbnailNetwork } from "./thumbnail-network";

// Limit native memory and avoid retaining open screenshot files on Windows.
sharp.cache(false);
sharp.concurrency(1);

type Render = (url: string, output: string) => Promise<void>;
type Result = { status: "ready"; file: string } | { status: "pending" | "unavailable" };
type Job = { id: string; version: string; url: string; validate?: () => Promise<boolean> };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const thumbnailVersion = (root: string, mtime: number, size: number) => hash(`${root}\0${mtime}\0${size}`).slice(0, 24);

export class ThumbnailCache {
  private queue: Job[] = [];
  private pending = new Set<string>();
  private failures = new Map<string, number>();
  private running = false;
  private waiters: Array<() => void> = [];
  idle(): Promise<void> {
    return this.running ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve();
  }
  constructor(private root: string, private render: Render = renderThumbnail) {}
  file(id: string, version: string) { return path.join(this.root, hash(id), `${hash(version)}.webp`); }
  async request(id: string, version: string, url: string, validate?: () => Promise<boolean>): Promise<Result> {
    const file = this.file(id, version);
    try { await fs.access(file); return { status: "ready", file }; } catch { /* Not generated yet. */ }
    const key = `${id}:${version}`;
    if ((this.failures.get(key) ?? 0) > Date.now()) return { status: "unavailable" };
    if (!this.pending.has(key) && this.pending.size < 40) {
      this.pending.add(key); this.queue.push({ id, version, url, validate });
      void this.run();
    }
    return { status: "pending" };
  }
  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.queue.shift(); job; job = this.queue.shift()) {
        const key = `${job.id}:${job.version}`, file = this.file(job.id, job.version), temporary = file + ".tmp";
        try {
          await fs.mkdir(path.dirname(file), { recursive: true });
          // Upgrade an existing PNG without launching the webpage again.
          const legacy = file.replace(/\.webp$/, ".png");
          let hasLegacy = false;
          try { await fs.access(legacy); hasLegacy = true; } catch { /* New work. */ }
          if (hasLegacy) await compressThumbnail(legacy, temporary);
          else await this.render(job.url, temporary);
          if (job.validate && !await job.validate()) throw new Error("Work changed during screenshot");
          await fs.rename(temporary, file);
          // Keep one cached screenshot per work; a rollback can regenerate its image.
          for (const entry of await fs.readdir(path.dirname(file))) {
            if ((entry.endsWith(".png") || entry.endsWith(".webp")) && entry !== path.basename(file)) await fs.rm(path.join(path.dirname(file), entry), { force: true });
          }
        } catch (error) {
          console.warn("[thumbnails] rendering failed:", error instanceof Error ? error.message : "Unknown error");
          this.failures.set(key, Date.now() + 5 * 60_000);
          if (this.failures.size > 256) this.failures.delete(this.failures.keys().next().value!);
        } finally {
          this.pending.delete(key);
          await fs.rm(temporary, { force: true }).catch(() => {});
        }
      }
    } finally { this.running = false; for (const resolve of this.waiters.splice(0)) resolve(); }
  }
}

async function chromiumPath(): Promise<string> {
  const candidates = process.env.THUMBNAIL_BROWSER_PATH ? [process.env.THUMBNAIL_BROWSER_PATH] : process.platform === "win32"
    ? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
    : ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/ungoogled-chromium-headless", "/usr/lib64/chromium-browser/headless_shell"];
  for (const candidate of candidates) { try { await fs.access(candidate); return candidate; } catch { /* Try next installed browser. */ } }
  throw new Error("No thumbnail browser installed");
}

export async function renderThumbnail(url: string, output: string): Promise<void> {
  const executable = await chromiumPath();
  const response = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error("Work page is unavailable for screenshot");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "drop-thumbnail-"));
  const network = await thumbnailNetwork(new URL(url));
  const png = path.join(temporary, "capture.png");
  // The browser gets a clean profile and environment, never application credentials.
  const demote = process.platform === "linux" && process.getuid?.() === 0;
  try {
    if (demote) { await fs.chown(temporary, 65534, 65534); await fs.chmod(temporary, 0o700); }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, ["--headless", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking",
        "--disable-extensions", "--disable-sync", "--no-first-run", "--mute-audio", "--hide-scrollbars", "--window-size=1200,760",
        "--virtual-time-budget=2000", "--timeout=8000", "--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        `--proxy-server=${network.url}`, "--proxy-bypass-list=<-loopback>",
        `--user-data-dir=${path.join(temporary, "profile")}`, `--screenshot=${png}`, url], {
        windowsHide: true, detached: process.platform !== "win32", stdio: "ignore",
        ...(demote ? { uid: 65534, gid: 65534 } : {}),
        env: { PATH: process.env.PATH, HOME: temporary, TMPDIR: temporary, TEMP: temporary, TMP: temporary,
          ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR } : {}) },
      });
      const timeout = setTimeout(() => {
        if (child.pid) {
          if (process.platform === "win32") spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          else { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Process already exited. */ } }
        }
        reject(new Error("Thumbnail rendering timed out"));
      }, 12_000);
      child.once("error", error => { clearTimeout(timeout); reject(error); });
      child.once("exit", code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error("Thumbnail browser failed")); });
    });
    const stat = await fs.stat(png);
    if (!stat.size || stat.size > 8 * 1024 * 1024) throw new Error("Invalid thumbnail size");
    await compressThumbnail(png, output);
  } finally { await network.close(); await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3 }).catch(() => {}); }
}

// Preserve the desktop page layout, then downsample the static image for cards.
export async function compressThumbnail(source: string, output: string): Promise<void> {
  await sharp(source, { limitInputPixels: 2_000_000 }).resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 }).toFile(output);
}
