import express, { Router } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, expect, it, vi } from "vitest";
import { config } from "./config";
import { prisma } from "./db";
import { cloudbaseRequest, getCloudbaseUser } from "./cloudbase";
import { requireAuth, requireAdmin } from "./middleware";
import { registerMigrationAdminRoutes } from "./account-migration";
import { cloudbaseAuthRouter } from "./routes.auth.cloudbase";
vi.mock("./cloudbase", async original => ({ ...await original<any>(), cloudbaseRequest: vi.fn(), getCloudbaseUser: vi.fn() }));
vi.mock("./db", () => ({ prisma: { user: { findUnique: vi.fn() }, $transaction: vi.fn() } }));
vi.mock("./auth-identity", () => ({ resolveAuthUser: vi.fn(async token => ({ userId: token === "admin" ? "administrator" : "original", username: "teacher" })) }));
const app = express(); app.use(express.json()); app.use("/auth", cloudbaseAuthRouter);
const admin = Router(); admin.use(requireAuth, requireAdmin); registerMigrationAdminRoutes(admin); app.use("/admin", admin);
const old = { id: "original", username: "原来老师", role: "USER", cloudbaseEnvId: "test-env", cloudbaseSubject: "old-subject", phone: null, createdAt: new Date("2025-01-01") };
let row: any;
let update: ReturnType<typeof vi.fn>;
function source(overrides = {}) { return { userId: old.id, oldSubject: old.cloudbaseSubject, oldUsername: old.username, envId: "test-env", phone: "+8613800138000", email: "new@example.com", ...overrides }; }
function approval(overrides = {}, options: { audience?: string; expiresIn?: number } = {}) { return jwt.sign(source(overrides), config.jwtSecret, { audience: options.audience ?? "account-migration-approval", expiresIn: options.expiresIn ?? 900 }); }
function emailProof(overrides = {}) { return jwt.sign({ ...source(), verificationId: "verification", ...overrides }, config.jwtSecret, { audience: "account-migration-email", expiresIn: 600 }); }
const credentials = { username: "new_teacher", password: "Secret!123", code: "123456" };
beforeEach(() => {
  vi.resetAllMocks(); config.authProvider = "cloudbase"; config.cloudbaseEnvId = "test-env";
  row = { ...old };
  vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => where.id === "administrator" ? { ...old, id: "administrator", role: "ADMIN" } : where.id === row.id || where.username === row.username || where.cloudbaseEnvId_cloudbaseSubject?.cloudbaseSubject === row.cloudbaseSubject ? { ...row } : null) as any);
  update = vi.fn(async ({ where, data }: any) => {
    if (row.id !== where.id || row.username !== where.username || row.cloudbaseSubject !== where.cloudbaseSubject || row.cloudbaseEnvId !== where.cloudbaseEnvId) return { count: 0 };
    Object.assign(row, data); return { count: 1 };
  });
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn({ $queryRaw: vi.fn(), user: { updateMany: update, findUnique: vi.fn(async () => ({ ...row })) } }));
  vi.mocked(getCloudbaseUser).mockImplementation(async token => token === "original-access" ? { sub: "old-subject", phone_number: "+86 13800138000" } : { sub: "new-subject", email: "new@example.com", username: "new_teacher" });
  vi.mocked(cloudbaseRequest).mockImplementation(async path => path === "/verification" ? { verification_id: "verification", expires_in: 600, is_user: false } : path === "/verification/verify" ? { verification_token: "email-proof" } : { access_token: "new-access", refresh_token: "new-refresh", expires_in: 7200, sub: "new-subject" });
});
it("does not let knowing a phone number reset another account or send an email", async () => {
  const result = await request(app).post("/auth/migration/code").send({ phone: "13800138000", email: "new@example.com" });
  expect(result.status).toBe(401); expect(result.body.message).toContain("不能仅凭手机号");
  expect(cloudbaseRequest).not.toHaveBeenCalled(); expect(prisma.$transaction).not.toHaveBeenCalled();
});
it.each(["forged", "expired", "other-env", "other-phone", "other-email", "wrong-purpose"])("rejects %s approval before sending email", async kind => {
  const token = kind === "forged" ? "forged" : kind === "expired" ? approval({}, { expiresIn: -1 }) : kind === "wrong-purpose" ? approval({}, { audience: "cloudbase-registration" }) : approval(kind === "other-env" ? { envId: "different" } : kind === "other-phone" ? { phone: "+8613900139000" } : { email: "different@example.com" });
  const result = await request(app).post("/auth/migration/code").send({ phone: "13800138000", email: "new@example.com", recoveryToken: token });
  expect([400, 401]).toContain(result.status); expect(cloudbaseRequest).not.toHaveBeenCalled();
});
it("accepts an authenticated original session only for its own phone and binds the new email in the challenge", async () => {
  const failed = await request(app).post("/auth/migration/code").set("Authorization", "Bearer original-access").send({ phone: "13900139000", email: "new@example.com" });
  expect(failed.status).toBe(401); expect(cloudbaseRequest).not.toHaveBeenCalled();
  const sent = await request(app).post("/auth/migration/code").set("Authorization", "Bearer original-access").send({ phone: "13800138000", email: "NEW@example.com" });
  expect(sent.status).toBe(200);
  expect(jwt.verify(sent.body.challenge, config.jwtSecret, { audience: "account-migration-email" })).toMatchObject(source());
});
it.each(["USER", "ADMIN"])("preserves original %s ID, role and ownership; consumes the migration approval", async role => {
  row.role = role;
  const sent = await request(app).post("/auth/migration/code").send({ phone: "13800138000", email: "new@example.com", recoveryToken: approval() });
  const result = await request(app).post("/auth/migration/verify").send({ ...credentials, challenge: sent.body.challenge, phone: "13900139000", email: "attacker@example.com", role: "ADMIN" });
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ token: "new-access", user: { id: "original", role, username: "new_teacher" } });
  expect(row).toMatchObject({ ...old, role, username: "new_teacher", cloudbaseSubject: "new-subject" });
  expect(update).toHaveBeenCalledWith({ where: { id: old.id, username: old.username, cloudbaseEnvId: "test-env", cloudbaseSubject: "old-subject" }, data: { username: "new_teacher", cloudbaseSubject: "new-subject" } });
  expect(cloudbaseRequest).toHaveBeenLastCalledWith("/signup", { email: "new@example.com", username: "new_teacher", password: "Secret!123", verification_token: "email-proof" });
  vi.mocked(cloudbaseRequest).mockClear();
  expect((await request(app).post("/auth/migration/code").send({ phone: "13800138000", email: "new@example.com", recoveryToken: approval() })).status).toBe(409);
  expect((await request(app).post("/auth/migration/verify").send({ ...credentials, challenge: sent.body.challenge })).status).toBe(409);
  expect(cloudbaseRequest).not.toHaveBeenCalled();
});
it("refuses an occupied username without consuming an OTP or changing identity", async () => {
  const find = vi.mocked(prisma.user.findUnique).getMockImplementation()!;
  vi.mocked(prisma.user.findUnique).mockImplementation((async (arg: any) => arg.where.username === "new_teacher" ? { ...old, id: "other" } as any : find(arg)) as any);
  const result = await request(app).post("/auth/migration/verify").send({ ...credentials, challenge: emailProof() });
  expect(result.status).toBe(409); expect(cloudbaseRequest).not.toHaveBeenCalled(); expect(row.cloudbaseSubject).toBe("old-subject");
});
it("rejects a mismatched verified email before changing ownership", async () => {
  vi.mocked(getCloudbaseUser).mockResolvedValue({ sub: "new-subject", email: "other@example.com", username: "new_teacher" });
  expect((await request(app).post("/auth/migration/verify").send({ ...credentials, challenge: emailProof() })).status).toBe(401);
  expect(prisma.$transaction).not.toHaveBeenCalled(); expect(row).toEqual(old);
});
it("cannot overwrite another request that wins the identity update", async () => {
  update.mockResolvedValue({ count: 0 });
  expect((await request(app).post("/auth/migration/verify").send({ ...credentials, challenge: emailProof() })).status).toBe(409);
  expect(row).toEqual(old);
});
it("rejects unique-identity conflicts without reporting success", async () => {
  update.mockRejectedValue({ code: "P2002" });
  expect((await request(app).post("/auth/migration/verify").send({ ...credentials, challenge: emailProof() })).status).toBe(409);
  expect(row).toEqual(old);
});
it("requires a real local administrator to issue an identity-bound approval", async () => {
  const input = { username: old.username, phone: "13800138000", email: "NEW@example.com", confirmed: true };
  expect((await request(app).post("/admin/account-migrations").send(input)).status).toBe(401);
  expect((await request(app).post("/admin/account-migrations").set("Authorization", "Bearer regular").send(input)).status).toBe(403);
  expect((await request(app).post("/admin/account-migrations").set("Authorization", "Bearer admin").send({ ...input, confirmed: false })).status).toBe(400);
  const result = await request(app).post("/admin/account-migrations").set("Authorization", "Bearer admin").send(input);
  expect(result.status).toBe(200); expect(result.body.expiresIn).toBe(900);
  const proof = jwt.verify(result.body.recoveryToken, config.jwtSecret, { audience: "account-migration-approval" }) as any;
  expect(proof).toMatchObject(source()); expect(proof.exp - proof.iat).toBe(900);
  expect(result.headers["cache-control"]).toBe("no-store");
});

it("does not extend a nearly expired approval with a fresh email challenge", async () => {
  const sent = await request(app).post("/auth/migration/code").send({phone:"13800138000",email:"new@example.com",recoveryToken:approval({}, {expiresIn:30})});
  expect(sent.status).toBe(200);
  expect(sent.body.expiresIn).toBeLessThanOrEqual(30);
  const signed = jwt.verify(sent.body.challenge, config.jwtSecret, {audience:"account-migration-email"}) as any;
  expect(signed.exp).toBeLessThanOrEqual(signed.approvedUntil);
});
it("rejects an elapsed approval even if a separately signed email proof has not expired", async () => {
  const challenge=emailProof({approvedUntil:Math.floor(Date.now()/1000)-1});
  expect((await request(app).post("/auth/migration/verify").send({...credentials,challenge})).status).toBe(401);
  expect(cloudbaseRequest).not.toHaveBeenCalled();
});
