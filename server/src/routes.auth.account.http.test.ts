import express from "express";
import request from "supertest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { config } from "./config";
import { prisma } from "./db";
import { cloudbaseAccountRouter } from "./routes.auth.account";
vi.mock("./db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
const app = express(); app.use(express.json()); app.use(cloudbaseAccountRouter);
beforeEach(() => {
  config.authProvider = "cloudbase"; config.cloudbaseEnvId = "test-env";
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "local", username: "teacher", cloudbaseSubject: "subject", cloudbaseEnvId: "test-env" } as any);
});
afterEach(() => vi.unstubAllGlobals());
it.each(["password", "contact"])("runs the SDK HTTP proof chain and authenticated PATCH for %s", async action => {
  const profile = { sub: "subject", phone_number: "+86 13800138000" };
  const replies: object[] = [profile, { verification_id: "own-id", expires_in: 600 }, profile, { verification_token: "own-verified" }, { sudo_token: "sudo" }, profile];
  if (action === "password") replies.push({});
  else replies.push({ verification_id: "new-id", expires_in: 600 }, profile, { verification_token: "new-verified" }, {}, { ...profile, email: "teacher@example.com" });
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(replies.shift())); }));
  const post = (path: string, body: object) => request(app).post(path).set("Authorization", "Bearer access").send(body);
  const sent = await post("/proof/code", { method: "sms" });
  const verified = await post("/proof/verify", { challenge: sent.body.challenge, code: "123456" });
  expect(verified.status).toBe(200);
  const proof = verified.body.proof;
  if (action === "password") expect((await post("/password", { proof, password: "Secret!123" })).status).toBe(200);
  else {
    const contact = await post("/contact/code", { proof, method: "email", identity: "Teacher@example.com" });
    expect((await post("/contact/verify", { proof, challenge: contact.body.challenge, code: "123456" })).status).toBe(200);
  }
  expect(replies).toHaveLength(0);
  const patched = calls.find(c => c.init.method === "PATCH")!;
  expect(patched.url).toBe(`https://test-env.api.tcloudbasegateway.com/auth/v1/user/${action}`);
  expect(patched.init.headers).toHaveProperty("Authorization", "Bearer access");
  expect(JSON.parse(patched.init.body as string)).toMatchObject({ sudo_token: "sudo", ...(action === "password" ? { new_password: "Secret!123" } : { email: "teacher@example.com", verification_token: "new-verified", conflict_resolution: "DEFAULT" }) });
});
