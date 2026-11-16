import express from "express";
import request from "supertest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { config } from "./config";
import { prisma } from "./db";
import { cloudbaseRequest, getCloudbaseUser } from "./cloudbase";
import { avatarRouter, saveAvatar } from "./user-avatars";
vi.mock("./cloudbase", async original => ({ ...await original<any>(), cloudbaseRequest: vi.fn(), getCloudbaseUser: vi.fn() }));
vi.mock("./db", () => ({ prisma: { $transaction: vi.fn(), $queryRaw: vi.fn(), user: { update: vi.fn() } } }));
const originalRoot = config.uploadRoot, originalUrl = config.baseUrl;
let body: { mimeType: string; data: string };
beforeEach(async () => {
  vi.resetAllMocks(); config.uploadRoot = await mkdtemp(path.join(os.tmpdir(), "drop-avatar-")); config.baseUrl = "https://example.com";
  body = { mimeType: "image/png", data: (await sharp({ create: { width: 16, height: 16, channels: 3, background: "red" } }).png().toBuffer()).toString("base64") };
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
  vi.mocked(getCloudbaseUser).mockImplementation(async () => ({ sub: "subject", picture: vi.mocked(cloudbaseRequest).mock.calls.at(-1)?.[1] && (vi.mocked(cloudbaseRequest).mock.calls.at(-1)![1] as any).avatar_url }));
});
afterEach(async () => { await rm(config.uploadRoot, { recursive: true, force: true }); config.uploadRoot = originalRoot; config.baseUrl = originalUrl; });
it("updates the official account avatar and reads picture back before caching; replacement uses a new immutable URL", async () => {
  const first = await saveAvatar(body, "access", "subject", "user");
  expect(cloudbaseRequest).toHaveBeenCalledWith("/user/basic/edit", { avatar_url: first.avatarUrl }, "access");
  expect(getCloudbaseUser).toHaveBeenCalledWith("access");
  expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user" }, data: first });
  const directory = (await readdir(path.join(config.uploadRoot, "avatars")))[0];
  const file = (await readdir(path.join(config.uploadRoot, "avatars", directory)))[0];
  const metadata = await sharp(await readFile(path.join(config.uploadRoot, "avatars", directory, file))).metadata();
  expect(metadata.format).toBe("webp"); expect(metadata.width).toBeLessThanOrEqual(256);
  expect((await saveAvatar(body, "access", "subject", "user")).avatarUrl).not.toBe(first.avatarUrl);
});
it("never updates the cache when CloudBase fails or returns a different subject/picture", async () => {
  vi.mocked(cloudbaseRequest).mockRejectedValueOnce(new Error("unavailable"));
  await expect(saveAvatar(body, "access", "subject", "user")).rejects.toMatchObject({ status: 503 });
  vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "other", picture: "https://example.com/other.webp" });
  await expect(saveAvatar(body, "access", "subject", "user")).rejects.toMatchObject({ status: 503 });
  expect(prisma.user.update).not.toHaveBeenCalled();
});
it("reports cache failure clearly so a later authenticated profile sync can repair it", async () => {
  vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error("database unavailable"));
  await expect(saveAvatar(body, "access", "subject", "user")).rejects.toMatchObject({ status: 503 });
});
it("rejects spoofed MIME types, corrupt images and oversized images", async () => {
  await expect(saveAvatar({ ...body, mimeType: "image/jpeg" }, "access", "subject", "user")).rejects.toThrow();
  await expect(saveAvatar({ ...body, data: Buffer.from("not an image").toString("base64") }, "access", "subject", "user")).rejects.toThrow();
  await expect(saveAvatar({ ...body, data: Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64") }, "access", "subject", "user")).rejects.toThrow();
  expect(cloudbaseRequest).not.toHaveBeenCalled();
});

it("serves only avatar images at stable URLs and rejects arbitrary storage paths", async () => {
  const saved = await saveAvatar(body, "access", "subject", "user");
  const app = express(); app.use("/api/avatars", avatarRouter);
  const response = await request(app).get(new URL(saved.avatarUrl).pathname);
  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toMatch(/^image\/webp/);
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
  expect(response.headers["cache-control"]).toContain("immutable");
  expect((await request(app).get("/api/avatars/other/config.env")).status).toBe(404);
});
