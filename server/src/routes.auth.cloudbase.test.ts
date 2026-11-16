import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { prisma } from "./db";
import { AuthError, cloudbaseRequest, getCloudbaseUser } from "./cloudbase";
import { resolveCloudbaseAccount } from "./cloudbase-accounts";
import { authRouter } from "./routes.auth";
vi.mock("./cloudbase", async original => ({ ...await original<any>(), cloudbaseRequest: vi.fn(), getCloudbaseUser: vi.fn() }));
vi.mock("./cloudbase-accounts", () => ({ resolveCloudbaseAccount: vi.fn() }));
vi.mock("./db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
const app = express(); app.use(express.json()); app.use(authRouter);
const session = { access_token: "access", refresh_token: "refresh", expires_in: 7200, sub: "subject" };
const user = { id: "local", username: "teacher", role: "USER", createdAt: new Date() };
function challenge(payload: object = {}, audience = "cloudbase-email-registration", expiresIn = 600) {
  return jwt.sign({ email: "teacher@example.com", verificationId: "id", envId: "test-env", ...payload }, config.jwtSecret, { audience, expiresIn });
}
const credentials = { code: "123456", username: "teacher", password: "Secret!123" };
beforeEach(() => {
  vi.resetAllMocks(); config.authProvider = "cloudbase"; config.cloudbaseEnvId = "test-env";
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(resolveCloudbaseAccount).mockResolvedValue(user as any);
  vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "subject", email: "teacher@example.com", username: "teacher" });
});
describe("email registration and password login", () => {
  it("advertises password login and email registration even with the previous sms setting", async () => {
    config.cloudbaseLoginMethod = "sms";
    expect((await request(app).get("/config")).body).toMatchObject({ provider: "cloudbase", loginMethod: "password", registrationMethod: "email", loginMethods: ["password"] });
  });
  it.each(["/sms/code", "/sms/verify", "/registration/complete"])("disables %s without contacting the SMS provider", async endpoint => {
    expect((await request(app).post(endpoint).send({})).status).toBe(410);
    expect(cloudbaseRequest).not.toHaveBeenCalled();
  });
  it("normalizes and signs an email registration challenge for NON_USER only", async () => {
    vi.mocked(cloudbaseRequest).mockResolvedValue({ verification_id: "id", expires_in: 9999, is_user: false });
    const sent = await request(app).post("/email/code").send({ email: "Teacher@example.com", captchaToken: "human" });
    expect(sent.status).toBe(200); expect(sent.headers["cache-control"]).toBe("no-store");
    expect(sent.body.expiresIn).toBe(600);
    expect(cloudbaseRequest).toHaveBeenCalledWith("/verification", { email: "teacher@example.com", target: "NON_USER" }, undefined, "human");
    expect(jwt.verify(sent.body.challenge, config.jwtSecret, { audience: "cloudbase-email-registration" })).toMatchObject({ email: "teacher@example.com", verificationId: "id", envId: "test-env" });
  });
  it.each([{ password: undefined }, { username: undefined }, { password: "weak" }, { username: "中文名字" }])("validates mandatory credentials before consuming an OTP: %o", async invalid => {
    const response = await request(app).post("/email/verify").send({ challenge: challenge(), ...credentials, ...invalid });
    expect(response.status).toBe(400); expect(cloudbaseRequest).not.toHaveBeenCalled();
  });
  it.each(["forged", "expired", "other-env", "old-email-purpose", "migration-purpose"])("rejects %s challenges without consuming the OTP", async kind => {
    const token = kind === "forged" ? "forged" : kind === "expired" ? challenge({}, undefined, -1) : kind === "other-env" ? challenge({ envId: "other-env" }) : challenge({}, kind === "old-email-purpose" ? "cloudbase-email" : "account-migration-email");
    expect((await request(app).post("/email/verify").send({ challenge: token, ...credentials })).status).toBe(400);
    expect(cloudbaseRequest).not.toHaveBeenCalled();
  });
  it("registers the verified email with a mandatory provider username and password, ignoring substituted email or roles", async () => {
    vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockResolvedValueOnce(session);
    const result = await request(app).post("/email/verify").send({ challenge: challenge(), ...credentials, email: "attacker@example.com", role: "ADMIN" });
    expect(result.status).toBe(200);
    expect(cloudbaseRequest).toHaveBeenNthCalledWith(2, "/signup", { email: "teacher@example.com", verification_token: "verified", username: "teacher", password: "Secret!123" });
    expect(resolveCloudbaseAccount).toHaveBeenCalledWith({ sub: "subject", email: "teacher@example.com", username: "teacher" }, { username: "teacher" });
    expect(result.body).toMatchObject({ token: "access", refreshToken: "refresh", user: { role: "USER" } });
    expect(result.body.password).toBeUndefined(); expect(result.body.user.passwordHash).toBeUndefined();
  });
  it("keeps the OTP unused when a local username is already occupied", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
    expect((await request(app).post("/email/verify").send({ challenge: challenge(), ...credentials })).status).toBe(409);
    expect(cloudbaseRequest).not.toHaveBeenCalled();
  });
  it.each([{ sub: "different", email: "teacher@example.com", username: "teacher" }, { sub: "subject", email: "other@example.com", username: "teacher" }, { sub: "subject", email: "teacher@example.com", username: "different" }])("rejects provider identity or username substitution: %o", async profile => {
    vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockResolvedValueOnce(session);
    vi.mocked(getCloudbaseUser).mockResolvedValue(profile);
    expect((await request(app).post("/email/verify").send({ challenge: challenge(), ...credentials })).status).toBe(401);
    expect(resolveCloudbaseAccount).not.toHaveBeenCalled();
  });
  it.each(["teacher", "Teacher@Example.com"])("logs in with %s and preserves the mapped user and role", async account => {
    vi.mocked(cloudbaseRequest).mockResolvedValue(session);
    vi.mocked(resolveCloudbaseAccount).mockResolvedValue({ ...user, id: "original", role: "ADMIN" } as any);
    const result = await request(app).post("/password/login").send({ username: account, password: "Secret!123" });
    expect(result.status).toBe(200);
    expect(cloudbaseRequest).toHaveBeenCalledWith("/signin", { username: account.includes("@") ? account.toLowerCase() : account, password: "Secret!123" }, undefined, undefined);
    expect(result.body.user).toMatchObject({ id: "original", role: "ADMIN" });
  });
  it("does not authenticate or create an account when the password is wrong", async () => {
    vi.mocked(cloudbaseRequest).mockRejectedValue(new AuthError("账号或密码错误"));
    expect((await request(app).post("/password/login").send({ username: "teacher", password: "wrong" })).status).toBe(400);
    expect(resolveCloudbaseAccount).not.toHaveBeenCalled();
  });
  it("propagates CAPTCHA and retryable provider errors", async () => {
    vi.mocked(cloudbaseRequest).mockRejectedValueOnce(new AuthError("图形验证", 400, "captcha_required")).mockRejectedValueOnce(new AuthError("稍后重试", 429)).mockRejectedValueOnce(new AuthError("服务不可用", 503));
    expect((await request(app).post("/email/code").send({ email: "a@example.com" })).body.captchaRequired).toBe(true);
    expect((await request(app).post("/email/code").send({ email: "a@example.com" })).status).toBe(429);
    expect((await request(app).post("/email/code").send({ email: "a@example.com" })).status).toBe(503);
  });
});

it("does not reuse an existing email as a password-reset or registration shortcut", async () => {
  vi.mocked(cloudbaseRequest).mockResolvedValue({ verification_id: "id", expires_in: 600, is_user: true });
  expect((await request(app).post("/email/code").send({ email: "teacher@example.com" })).status).toBe(409);
  expect(resolveCloudbaseAccount).not.toHaveBeenCalled();
});
it("rejects a password session whose immutable subject differs from its profile", async () => {
  vi.mocked(cloudbaseRequest).mockResolvedValue(session);
  vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "another" });
  expect((await request(app).post("/password/login").send({ username: "teacher", password: "Secret!123" })).status).toBe(401);
  expect(resolveCloudbaseAccount).not.toHaveBeenCalled();
});
