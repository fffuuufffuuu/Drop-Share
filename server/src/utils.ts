import crypto from "node:crypto";
import path from "node:path";

export function randomSlug(length = 10): string {
  return crypto
    .randomBytes(length)
    .toString("base64url")
    .slice(0, length)
    .toLowerCase();
}

export function uploaderAgentForStorage(userAgent: string | undefined): string | null {
  return userAgent?.slice(0, 191) ?? null;
}

export function sanitizeRelativePath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const safe = path.posix.normalize(normalized);
  if (safe.startsWith("../") || safe.includes("/../") || safe === "..") {
    throw new Error("Invalid file path");
  }
  return safe;
}

export function addHours(date: Date, hours: number): Date {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}
