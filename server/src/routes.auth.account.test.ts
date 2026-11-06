import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, expect, it, vi } from "vitest";
import { config } from "./config";
import { AuthError, cloudbaseRequest, getCloudbaseUser } from "./cloudbase";
import { prisma } from "./db";
import { cloudbaseAccountRouter } from "./routes.auth.account";
vi.mock("./cloudbase", async original => ({ ...await original<any>(), cloudbaseRequest: vi.fn(), getCloudbaseUser: vi.fn() }));
vi.mock("./db", () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() } }));
const app = express(); app.use(express.json()); app.use(cloudbaseAccountRouter);
const post = (path: string, body: object) => request(app).post(path).set("Authorization", "Bearer access").send(body);
function proof(sub = "subject") { return jwt.sign({ sub, envId: "test-env", sudoToken: "sudo" }, config.jwtSecret, { audience: "cloudbase-account-proof", expiresIn: 600 }); }
beforeEach(() => {
  vi.resetAllMocks(); config.authProvider = "cloudbase"; config.cloudbaseEnvId = "test-env";
  vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "subject", phone_number: "+86 13800138000" });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "local", username: "teacher", cloudbaseSubject: "subject", cloudbaseEnvId: "test-env" } as any);
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
});
it("updates only the authenticated user's display nickname without changing their login identity", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: "local", username: "teacher", cloudbaseSubject: "subject", cloudbaseEnvId: "test-env" } as any).mockResolvedValueOnce(null);
  vi.mocked(prisma.user.update).mockResolvedValue({ username: "物理老师" } as any);
  const response = await post("/nickname", { nickname: " 物理老师 ", userId: "other" });
  expect(response.status).toBe(200);expect(response.body.username).toBe("物理老师");
  expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "local" }, data: { username: "物理老师" }, select: { username: true } });
  expect(cloudbaseRequest).not.toHaveBeenCalled();
});
it("rejects duplicate nicknames and invalid input", async () => {
  expect((await post("/nickname", { nickname: " " })).status).toBe(400);
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: "local", username: "teacher", cloudbaseSubject: "subject", cloudbaseEnvId: "test-env" } as any).mockResolvedValueOnce({ id: "other" } as any);
  expect((await post("/nickname", { nickname: "taken" })).status).toBe(409);
});
it("does not expose an unbind endpoint", async () => {
  expect((await post("/contact/unbind", { method: "sms", proof: proof(), confirmed: true })).status).toBe(404);
  expect(cloudbaseRequest).not.toHaveBeenCalled();
});
it("supports verified replacement of a bound contact and rejects stale replacement challenges", async () => {
  const old = { sub: "subject", phone_number: "+86 13800138000", email: "old@example.com" };
  vi.mocked(getCloudbaseUser).mockResolvedValue(old);
  vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_id: "id", expires_in: 600 });
  const sent = await post("/contact/code", { proof: proof(), method: "email", identity: "new@example.com" });
  expect(sent.status).toBe(200);
  expect(jwt.verify(sent.body.challenge, config.jwtSecret, { audience: "cloudbase-contact-challenge" })).toMatchObject({ previousIdentity: "old@example.com" });
  vi.mocked(getCloudbaseUser).mockResolvedValueOnce(old).mockResolvedValueOnce(old).mockResolvedValueOnce({ ...old, email: "new@example.com" });
  vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockResolvedValueOnce({});
  expect((await post("/contact/verify", { proof: proof(), challenge: sent.body.challenge, code: "123456" })).status).toBe(200);
  vi.mocked(getCloudbaseUser).mockResolvedValue({ ...old, email: "changed@example.com" });
  vi.mocked(cloudbaseRequest).mockClear();
  expect((await post("/contact/verify", { proof: proof(), challenge: sent.body.challenge, code: "123456" })).status).toBe(409);
  expect(cloudbaseRequest).not.toHaveBeenCalled();
});
it("rejects a replacement that became stale while waiting for the contact lock", async () => {
  const challenge = jwt.sign({ sub: "subject", envId: "test-env", method: "email", identity: "new@example.com", previousIdentity: "old@example.com", verificationId: "id" }, config.jwtSecret, { audience: "cloudbase-contact-challenge", expiresIn: 600 });
  vi.mocked(getCloudbaseUser).mockResolvedValueOnce({ sub: "subject", email: "old@example.com" }).mockResolvedValue({ sub: "subject", email: "changed@example.com" });
  vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockResolvedValueOnce({});
  expect((await post("/contact/verify", { proof: proof(), challenge, code: "123456" })).status).toBe(409);
  expect(prisma.$queryRaw).toHaveBeenCalled();
  expect(cloudbaseRequest).not.toHaveBeenCalled();
});
it("requires a mapped authenticated identity", async () => {
  expect((await request(app).get("/")).status).toBe(401);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  expect((await request(app).get("/").set("Authorization", "Bearer access")).status).toBe(401);
});
it("only sends step-up verification to the current user's bound contact", async () => {
  vi.mocked(cloudbaseRequest).mockResolvedValue({ verification_id: "id", expires_in: 600 });
  const response = await post("/proof/code", { method: "sms", phone: "13900139000" });
  expect(response.status).toBe(200);
  expect(cloudbaseRequest).toHaveBeenCalledWith("/verification", { phone_number: "+86 13800138000", target: "CUR_USER" }, "access", undefined);
  const claim = jwt.verify(response.body.challenge, config.jwtSecret, { audience: "cloudbase-account-challenge" }) as any;
  expect(claim.sub).toBe("subject");
});
it("cannot use another subject's proof to change credentials", async () => {
  const response = await post("/password", { proof: proof("other"), username: "teacher", password: "New!Password123" });
  expect(response.status).toBe(400); expect(cloudbaseRequest).not.toHaveBeenCalled();
});
it("uses SDK sudo_token semantics and never writes local password hashes", async () => {
  vi.mocked(cloudbaseRequest).mockResolvedValue({});
  const response = await post("/password", { proof: proof(), username: "teacher", password: "New!Password123" });
  expect(response.status).toBe(200);
  expect(cloudbaseRequest).toHaveBeenCalledWith("/user/password", { new_password: "New!Password123", sudo_token: "sudo" }, "access", undefined, "PATCH");
  expect(cloudbaseRequest).not.toHaveBeenCalledWith("/user/basic/edit", expect.anything(), expect.anything());
});
it("prevents choosing another local user's reserved username", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: "local", username: "teacher", cloudbaseSubject: "subject", cloudbaseEnvId: "test-env" } as any).mockResolvedValueOnce({ id: "other" } as any);
  expect((await post("/username", { proof: proof(), username: "reserved" })).status).toBe(409);
  expect(cloudbaseRequest).not.toHaveBeenCalled();
});
it("obtains a sudo proof with the official SDK verification chain", async () => {
  const challenge = jwt.sign({ sub: "subject", envId: "test-env", method: "sms", identity: "+8613800138000", verificationId: "id" }, config.jwtSecret, { audience: "cloudbase-account-challenge", expiresIn: 600 });
  vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockResolvedValueOnce({ sudo_token: "sudo" });
  const response = await post("/proof/verify", { challenge, code: "123456" });
  expect(response.status).toBe(200);
  expect(cloudbaseRequest).toHaveBeenCalledWith("/user/sudo", { verification_token: "verified" }, "access");
  expect(jwt.verify(response.body.proof, config.jwtSecret, { audience: "cloudbase-account-proof" })).toMatchObject({ sub: "subject", sudoToken: "sudo", envId: "test-env" });
});
it("never changes the login username when setting a password fails", async () => {
  vi.mocked(cloudbaseRequest).mockRejectedValue(new AuthError("请重新验证"));
  expect((await post("/password", { proof: proof(), username: "changed", password: "New!Password123" })).status).toBe(400);
  expect(cloudbaseRequest).toHaveBeenCalledTimes(1);
  expect(vi.mocked(cloudbaseRequest).mock.calls[0][0]).toBe("/user/password");
});
it("does not bind after provider contact conflict or an inconsistent readback", async () => {
  const challenge = jwt.sign({ sub: "subject", envId: "test-env", method: "email", identity: "teacher@example.com", verificationId: "id" }, config.jwtSecret, { audience: "cloudbase-contact-challenge", expiresIn: 600 });
  vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockRejectedValueOnce(new AuthError("已绑定其他账号", 409));
  expect((await post("/contact/verify", { proof: proof(), challenge, code: "123456" })).status).toBe(409);
  expect(getCloudbaseUser).toHaveBeenCalledTimes(2);
  vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockResolvedValueOnce({});
  expect((await post("/contact/verify", { proof: proof(), challenge, code: "123456" })).status).toBe(409);
});
it("binds a verified new email to the same subject without transferring other accounts", async () => {
  const challenge = jwt.sign({ sub: "subject", envId: "test-env", method: "email", identity: "teacher@example.com", verificationId: "id" }, config.jwtSecret, { audience: "cloudbase-contact-challenge", expiresIn: 600 });
  vi.mocked(cloudbaseRequest).mockResolvedValueOnce({ verification_token: "verified" }).mockResolvedValueOnce({});
  vi.mocked(getCloudbaseUser).mockResolvedValueOnce({ sub: "subject", phone_number: "+86 13800138000" }).mockResolvedValueOnce({ sub: "subject", phone_number: "+86 13800138000" }).mockResolvedValueOnce({ sub: "subject", phone_number: "+86 13800138000", email: "teacher@example.com" });
  expect((await post("/contact/verify", { proof: proof(), challenge, code: "123456" })).status).toBe(200);
  expect(cloudbaseRequest).toHaveBeenCalledWith("/user/contact", { email: "teacher@example.com", verification_token: "verified", sudo_token: "sudo", conflict_resolution: "DEFAULT" }, "access", undefined, "PATCH");
});
