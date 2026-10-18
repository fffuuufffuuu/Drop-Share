import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { verifyCloudbaseAcceptance } from "./cloudbase-acceptance";
import { readFileSync } from "node:fs";
import { runInNewContext, Script } from "node:vm";

const proof = { sms: true, identity: "+8613800138000", id: "challenge", isUser: true };
const profile = { sub: "provider-id", phone_number: "+86 13800138000" }; // Real PG response shape: no status.
const session = { sub: "provider-id", access_token: "access", refresh_token: "refresh", expires_in: 7200 };
const refreshed = { ...session, access_token: "access2", refresh_token: "refresh2" };
const denied = { error: "unauthenticated", error_code: 16 };
type Reply = { body?: unknown; status?: number; empty?: boolean };
function provider(replies: Reply[]) {
  const fetchMock = vi.fn(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("Unexpected provider request");
    return new Response(reply.empty ? null : JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function successfulPrefix(): Reply[] {
  return [{ body: { verification_token: "verified" } }, { body: session }, { body: profile }, { body: refreshed }, { body: profile }, { body: {} }];
}
beforeEach(() => { config.cloudbaseEnvId = "test-env"; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("documented CloudBase HTTP acceptance flow", () => {
  it("serves syntactically valid browser JavaScript from the acceptance page template", () => {
    const source = readFileSync("scripts/verify-cloudbase-auth.cjs", "utf8");
    const template = source.match(/const html = (`[\s\S]*?`);/)![1];
    const html = runInNewContext(template) as string;
    expect(() => new Script(html.match(/<script>([\s\S]*?)<\/script>/)![1])).not.toThrow();
  });
  it.each([true, false])("validates identity, rotation and both revoked credentials (existing user: %s)", async isUser => {
    const fetchMock = provider([...successfulPrefix(), { body: denied, status: 401 }, { body: { error: "invalid_grant" }, status: 400 }]);
    await expect(verifyCloudbaseAcceptance({ ...proof, isUser }, "123456")).resolves.toEqual({ profileValidated: true, refreshRotated: true, accessRevoked: true, refreshRevoked: true });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url]) => url.replace("https://test-env.api.tcloudbasegateway.com/auth/v1", ""))).toEqual(["/verification/verify", isUser ? "/signin" : "/signup", "/user/me", "/token", "/user/me", "/user/signout", "/user/me", "/token"]);
    expect(JSON.parse(calls[1][1].body as string)).toEqual(isUser ? { verification_token: "verified" } : { verification_token: "verified", phone_number: "+86 13800138000" });
    expect(calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(calls[2][1].headers).toHaveProperty("Authorization", "Bearer access");
    expect(calls[3][1].headers).not.toHaveProperty("Authorization");
    expect(calls[5][1].headers).toHaveProperty("Authorization", "Bearer access2");
    expect(JSON.parse(calls[7][1].body as string)).toEqual({ grant_type: "refresh_token", refresh_token: "refresh2" });
  });
  it("does not count a successful malformed profile as proof that access is revoked", async () => {
    provider([...successfulPrefix(), { body: {} }]);
    await expect(verifyCloudbaseAcceptance(proof, "123456")).rejects.toThrow("退出后访问令牌仍可用");
  });
  it("does not count an outage as proof of revocation", async () => {
    provider([...successfulPrefix(), { body: { error: "unavailable" }, status: 503 }]);
    await expect(verifyCloudbaseAcceptance(proof, "123456")).rejects.toMatchObject({ status: 503 });
  });
  it("fails if refresh still works and closes the unexpectedly issued session", async () => {
    const fetchMock = provider([...successfulPrefix(), { body: denied, status: 401 }, { body: { ...refreshed, access_token: "unexpected-access" } }, { body: {} }]);
    await expect(verifyCloudbaseAcceptance(proof, "123456")).rejects.toThrow("退出后刷新令牌仍可用");
    expect((fetchMock.mock.calls as unknown as [string, RequestInit][]).at(-1)?.[1].headers).toHaveProperty("Authorization", "Bearer unexpected-access");
  });
  it("cleans up issued sessions on a mismatched authenticated identity", async () => {
    const fetchMock = provider([{ body: { verification_token: "verified" } }, { body: session }, { body: { ...profile, sub: "another-user" } }, { body: {} }]);
    await expect(verifyCloudbaseAcceptance(proof, "123456")).rejects.toThrow("认证身份不匹配");
    expect((fetchMock.mock.calls as unknown as [string, RequestInit][]).at(-1)?.[0]).toContain("/user/signout");
  });
  it("does not confuse a cleanup error with rejection of a still-working refresh token", async () => {
    provider([...successfulPrefix(), { body: denied, status: 401 }, { body: refreshed }, { body: denied, status: 401 }]);
    await expect(verifyCloudbaseAcceptance(proof, "123456")).rejects.toThrow();
  });
  it.each(["signin", "refresh"])("cleans up a token issued with an incompatible %s response", async phase => {
    const replies = phase === "signin"
      ? [{ body: { verification_token: "verified" } }, { body: { access_token: "issued-with-bad-profile" } }, { body: {} }]
      : [{ body: { verification_token: "verified" } }, { body: session }, { body: profile }, { body: { access_token: "issued-with-bad-profile" } }, { body: {} }];
    const fetchMock = provider(replies);
    await expect(verifyCloudbaseAcceptance(proof, "123456")).rejects.toThrow();
    expect((fetchMock.mock.calls as unknown as [string, RequestInit][]).at(-1)?.[0]).toContain("/user/signout");
    expect((fetchMock.mock.calls as unknown as [string, RequestInit][]).at(-1)?.[1].headers).toHaveProperty("Authorization", "Bearer issued-with-bad-profile");
  });
});
