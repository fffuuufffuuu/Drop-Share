import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { AuthError, cloudbaseRequest, getCloudbaseUser } from "./cloudbase";
import { resolveCloudbaseAccount } from "./cloudbase-accounts";
import { cloudbaseAuthRouter } from "./routes.auth.cloudbase";
vi.mock("./cloudbase", async original => ({ ...await original<any>(), cloudbaseRequest: vi.fn(), getCloudbaseUser: vi.fn() }));
vi.mock("./cloudbase-accounts", () => ({ resolveCloudbaseAccount: vi.fn() }));
vi.mock("./db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
const app = express(); app.use(express.json()); app.use(cloudbaseAuthRouter);
beforeEach(() => { vi.resetAllMocks(); config.authProvider = "cloudbase"; config.cloudbaseEnvId = "test-env"; });
describe("CloudBase email routes", () => {
  it("deducts registration waiting time from the access token lifetime", async () => {
    const registrationToken = jwt.sign({ iat: Math.floor(Date.now() / 1000) - 120, envId: "test-env", session: { access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" } }, config.jwtSecret, { audience: "cloudbase-registration", expiresIn: 300 });
    vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "subject" });
    vi.mocked(resolveCloudbaseAccount).mockResolvedValue({ id: "local", username: "teacher", role: "USER", createdAt: new Date() } as any);
    const response = await request(app).post("/registration/complete").send({ registrationToken, username: "teacher" });
    expect(response.status).toBe(200);
    expect(response.body.expiresIn).toBeLessThanOrEqual(7080);
    expect(response.body.expiresIn).toBeGreaterThan(7075);
  });
  it("lets a verified provider identity finish local registration without another OTP", async () => {
    const challenge = jwt.sign({ email: "teacher@example.com", verificationId: "id", envId: "test-env", isUser: true }, config.jwtSecret, { audience: "cloudbase-email", expiresIn: 600 });
    vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockResolvedValueOnce({ access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" });
    vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "subject", email: "teacher@example.com" });
    vi.mocked(resolveCloudbaseAccount).mockRejectedValueOnce(new AuthError("用户名必填", 400, "username_required")).mockResolvedValueOnce({ id: "local", username: "teacher", role: "USER", createdAt: new Date() } as any);
    const pending = await request(app).post("/email/verify").send({ challenge, code: "123456" });
    expect(pending.status).toBe(400); expect(pending.body.usernameRequired).toBe(true);
    const completed = await request(app).post("/registration/complete").send({ registrationToken: pending.body.registrationToken, username: "teacher" });
    expect(completed.status).toBe(200); expect(completed.body.user.username).toBe("teacher");
    expect(cloudbaseRequest).toHaveBeenCalledTimes(2);
    expect(getCloudbaseUser).toHaveBeenLastCalledWith("access");
  });
  it("rejects forged and mismatched registration proofs before creating accounts", async () => {
    expect((await request(app).post("/registration/complete").send({ registrationToken: "forged", username: "teacher" })).status).toBe(400);
    expect(getCloudbaseUser).not.toHaveBeenCalled();
    const registrationToken = jwt.sign({ envId: "test-env", session: { access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" } }, config.jwtSecret, { audience: "cloudbase-registration", expiresIn: 300 });
    vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "other" });
    expect((await request(app).post("/registration/complete").send({ registrationToken, username: "teacher" })).status).toBe(401);
    expect(resolveCloudbaseAccount).not.toHaveBeenCalled();
  });
  it.each(["sms", "email"])("rejects new %s registration without a username before consuming the OTP", async method => {
    const challenge = jwt.sign({ ...(method === "sms" ? {phone: "+8613800138000"} : {email: "teacher@example.com"}), verificationId: "id", envId: "test-env", isUser: false }, config.jwtSecret, { audience: `cloudbase-${method}`, expiresIn: 600 });
    const response = await request(app).post(`/${method}/verify`).send({ challenge, code: "123456" });
    expect(response.status).toBe(400); expect(response.body.usernameRequired).toBe(true);
    expect(cloudbaseRequest).not.toHaveBeenCalled();
  });
  it("authenticates passwords with CloudBase and preserves the mapped local account", async () => {
    vi.mocked(cloudbaseRequest).mockResolvedValue({ access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" });
    vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "subject", username: "teacher" });
    vi.mocked(resolveCloudbaseAccount).mockResolvedValue({ id: "original", username: "teacher", role: "ADMIN", createdAt: new Date() } as any);
    const response = await request(app).post("/password/login").send({ username: "teacher", password: "Secret!123" });
    expect(response.status).toBe(200);
    expect(cloudbaseRequest).toHaveBeenCalledWith("/signin", { username: "teacher", password: "Secret!123" }, undefined, undefined);
    expect(response.body.user).toMatchObject({ id: "original", role: "ADMIN" });
    expect(resolveCloudbaseAccount).toHaveBeenCalledWith({ sub: "subject", username: "teacher" }, { username: "teacher" });
  });
  it("never resolves a local account when password authentication fails or the subject differs", async () => {
    vi.mocked(cloudbaseRequest).mockRejectedValueOnce(new AuthError("用户名或密码错误"));
    expect((await request(app).post("/password/login").send({ username: "teacher", password: "wrong" })).status).toBe(400);
    expect(resolveCloudbaseAccount).not.toHaveBeenCalled();
    vi.mocked(cloudbaseRequest).mockResolvedValue({ access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" });
    vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "other" });
    expect((await request(app).post("/password/login").send({ username: "teacher", password: "wrong" })).status).toBe(401);
    expect(resolveCloudbaseAccount).not.toHaveBeenCalled();
  });
  it("reports a provider CAPTCHA challenge so the human can complete it",async()=>{
    vi.mocked(cloudbaseRequest).mockRejectedValue(new AuthError("需要图形验证",400,"captcha_required"));
    const response=await request(app).post("/sms/code").send({phone:"13800138000"});
    expect(response.status).toBe(400);expect(response.body.captchaRequired).toBe(true);
  });
  it("normalizes a mainland phone and binds the SMS challenge to that number", async () => {
    vi.mocked(cloudbaseRequest).mockResolvedValue({ verification_id: "sms-challenge", expires_in: 600, is_user: true });
    const response = await request(app).post("/sms/code").send({ phone: "13800138000" });
    expect(response.status).toBe(200);
    expect(cloudbaseRequest).toHaveBeenCalledWith("/verification", { phone_number: "+86 13800138000", target: "ANY" });
    expect(jwt.verify(response.body.challenge, config.jwtSecret, { audience: "cloudbase-sms" })).toMatchObject({ phone: "+8613800138000" });
  });
  it("passes the human verification token only in the documented captcha header argument",async()=>{
    vi.mocked(cloudbaseRequest).mockResolvedValue({verification_id:"id",expires_in:600,is_user:true});
    const response=await request(app).post("/sms/code").send({phone:"13800138000",captchaToken:"human-proof"});
    expect(response.status).toBe(200);
    expect(cloudbaseRequest).toHaveBeenCalledWith("/verification",{phone_number:"+86 13800138000",target:"ANY"},undefined,"human-proof");
  });
  it("rejects an email proof at the SMS endpoint", async () => {
    const challenge = jwt.sign({ email: "a@example.com", verificationId: "id", envId: "test-env", isUser: true }, config.jwtSecret, { audience: "cloudbase-email", expiresIn: 600 });
    const response = await request(app).post("/sms/verify").send({ challenge, code: "123456" });
    expect(response.status).toBe(400); expect(cloudbaseRequest).not.toHaveBeenCalled();
  });
  it("uses the provider phone format for signup and compares the normalized verified phone", async () => {
    const challenge = jwt.sign({ phone: "+8613800138000", verificationId: "id", envId: "test-env", isUser: false }, config.jwtSecret, { audience: "cloudbase-sms", expiresIn: 600 });
    vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "proof" }).mockResolvedValueOnce({ access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" });
    vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "subject", phone_number: "+86 13800138000", status: "ACTIVE" });
    vi.mocked(resolveCloudbaseAccount).mockResolvedValue({ id: "local", username: "teacher", role: "USER", createdAt: new Date() } as any);
    const response = await request(app).post("/sms/verify").send({ challenge, code: "123456", username: "teacher" });
    expect(response.status).toBe(200);
    expect(cloudbaseRequest).toHaveBeenCalledWith("/signup", { phone_number: "+86 13800138000", verification_token: "proof" });
  });
  it("signs the provider challenge and prevents client email substitution", async () => {
    vi.mocked(cloudbaseRequest).mockResolvedValue({ verification_id: "provider-challenge", expires_in: 600, is_user: false });
    const response = await request(app).post("/email/code").send({ email: "Teacher@example.com" });
    expect(response.status).toBe(200);
    const payload = jwt.verify(response.body.challenge, config.jwtSecret, { audience: "cloudbase-email" }) as any;
    expect(payload).toMatchObject({ email: "teacher@example.com", verificationId: "provider-challenge", envId: "test-env", isUser: false });
  });
  it("rejects a forged challenge without calling the provider", async () => {
    const response = await request(app).post("/email/verify").send({ challenge: "forged", code: "123456" });
    expect(response.status).toBe(400); expect(cloudbaseRequest).not.toHaveBeenCalled();
  });
  it("verifies email and subject before creating or binding any local account", async () => {
    const challenge = jwt.sign({ email: "teacher@example.com", verificationId: "id", envId: "test-env", isUser: true }, config.jwtSecret, { audience: "cloudbase-email", expiresIn: 600 });
    vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "proof" }).mockResolvedValueOnce({ access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" });
    vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "different", email: "teacher@example.com", status: "ACTIVE" });
    const response = await request(app).post("/email/verify").send({ challenge, code: "123456" });
    expect(response.status).toBe(401); expect(resolveCloudbaseAccount).not.toHaveBeenCalled();
  });
  it("does not return password hashes or provider roles", async () => {
    const challenge = jwt.sign({ email: "teacher@example.com", verificationId: "id", envId: "test-env", isUser: false }, config.jwtSecret, { audience: "cloudbase-email", expiresIn: 600 });
    vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "proof" }).mockResolvedValueOnce({ access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" });
    vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "subject", email: "teacher@example.com", status: "ACTIVE" });
    vi.mocked(resolveCloudbaseAccount).mockResolvedValue({ id: "local", username: "teacher", role: "USER", passwordHash: "never-return", createdAt: new Date() } as any);
    const response = await request(app).post("/email/verify").send({ challenge, code: "123456", username: "teacher" });
    expect(response.status).toBe(200); expect(response.body.token).toBe("access"); expect(response.body.user.passwordHash).toBeUndefined();
    expect(cloudbaseRequest).toHaveBeenCalledWith("/signup", { email: "teacher@example.com", verification_token: "proof" });
  });
});
