import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { resolveCloudbaseAccount } from "./cloudbase-accounts";
import { cloudbaseAuthRouter } from "./routes.auth.cloudbase";

vi.mock("./db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("./cloudbase-accounts", () => ({ resolveCloudbaseAccount: vi.fn() }));
const app = express(); app.use(express.json()); app.use(cloudbaseAuthRouter);
beforeEach(() => { config.authProvider = "cloudbase"; config.cloudbaseEnvId = "test-env"; vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("SMS routes through the real CloudBase HTTP boundary", () => {
  it.each([true, false])("accepts an authenticated PG profile without status (existing: %s)", async isUser => {
    const replies = [
      { verification_id: "provider-challenge", expires_in: 600, is_user: isUser },
      { verification_token: "verified" },
      { access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" },
      { sub: "subject", phone_number: "+86 13800138000" },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(replies.shift())));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(resolveCloudbaseAccount).mockResolvedValue({ id: "old-id", username: "teacher", role: "USER", createdAt: new Date() } as any);
    const sent = await request(app).post("/sms/code").send({ phone: "13800138000" });
    expect(sent.status).toBe(200);
    expect(sent.body.requiresUsername).toBe(!isUser);
    const verified = await request(app).post("/sms/verify").send({ challenge: sent.body.challenge, code: "123456", ...(!isUser ? {username: "teacher"} : {}) });
    expect(verified.status).toBe(200);
    expect(verified.body).toMatchObject({ token: "access", refreshToken: "refresh", user: { id: "old-id" } });
    expect(resolveCloudbaseAccount).toHaveBeenCalledWith({ sub: "subject", phone_number: "+86 13800138000" }, expect.anything());
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ phone_number: "+86 13800138000", target: "ANY" });
    expect(calls[2][0]).toMatch(isUser ? /\/signin$/ : /\/signup$/);
    expect(calls[3][1].headers).toHaveProperty("Authorization", "Bearer access");
  });
});
