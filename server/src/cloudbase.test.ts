import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { cloudbaseRequest, getCloudbaseUser } from "./cloudbase";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("CloudBase authentication boundary", () => {
  it("keeps only safe provider diagnostics and does not expose the upstream description", async () => {
    config.cloudbaseEnvId = "test-env";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_argument", error_code: 3, requestId: "request-123", error_description: "private phone and credential details" }), { status: 400 })));
    await expect(cloudbaseRequest("/verification", {})).rejects.toMatchObject({ message: "身份验证失败，请重试", code: "invalid_argument", diagnostic: { upstreamStatus: 400, errorCode: 3, requestId: "request-123" } });
  });
  it("identifies incompatible profile fields without recording identity values", async () => {
    config.cloudbaseEnvId = "test-env";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: "private-subject", email: "invalid-email", phone_number: "+86 13800138000", status: "ACTIVE" }))));
    await expect(getCloudbaseUser("private-token")).rejects.toMatchObject({ code: "invalid_profile", diagnostic: { profileIssues: [{ field: "email", code: "invalid_format", valueKind: "string" }] } });
  });
  it.each([{}, {email:""}, {status:"ACTIVE"}])("accepts provider-authenticated profiles without undocumented required fields: %j", async optional => {
    config.cloudbaseEnvId = "test-env";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({sub:"provider-subject",phone_number:"+86 13800138000",...optional}))));
    const profile = await getCloudbaseUser("provider-token");
    expect(profile.sub).toBe("provider-subject");
    expect(profile.email).toBeUndefined();
    expect(profile.status).toBe(optional.status);
  });
  it("validates the token at the configured environment, ignoring client claims", async () => {
    config.cloudbaseEnvId = "test-env";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: "provider-id", email: "teacher@example.com", status: "ACTIVE", groups: ["ADMIN"] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getCloudbaseUser("provider-token")).toMatchObject({ sub: "provider-id" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://test-env.api.tcloudbasegateway.com/auth/v1/user/me");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer provider-token");
  });

  it.each([{ sub: "service_account", status: "ACTIVE" }, { sub: "user", status: "DISABLED" }, { email: "a@b.com", status: "ACTIVE" }])("rejects unusable provider profiles %j", async profile => {
    config.cloudbaseEnvId = "test-env";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(profile))));
    await expect(getCloudbaseUser("token")).rejects.toThrow();
  });

  it("fails closed on provider outages without leaking upstream details", async () => {
    config.cloudbaseEnvId = "test-env";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal credential detail")));
    await expect(cloudbaseRequest("/user/me", undefined, "token")).rejects.toMatchObject({ status: 503, message: "认证服务暂不可用，请稍后重试" });
  });

  it("keeps provider rate limiting retryable instead of invalidating a session", async () => {
    config.cloudbaseEnvId = "test-env";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "resource_exhausted" }), { status: 429 })));
    await expect(getCloudbaseUser("valid-token")).rejects.toMatchObject({ status: 429 });
  });
});
