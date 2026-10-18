import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { spaceRouter } from "./routes.spaces";
import { adminRouter } from "./routes.admin";

const fixture = vi.hoisted(() => {
  const deployments = [
    { id: "visible", spaceId: "s1", viewCount: 3, visibility: "visible", deletedAt: null, tags: [], owner: null },
    { id: "hidden", spaceId: "s1", viewCount: 7, visibility: "hidden", deletedAt: null, tags: [], owner: null },
    { id: "deleted", spaceId: "s1", viewCount: 99, visibility: "visible", deletedAt: new Date(), tags: [], owner: null },
    { id: "other", spaceId: "other", viewCount: 200, visibility: "visible", deletedAt: null, tags: [], owner: null },
  ];
  const space = { id: "s1", ownerUserId: "owner", name: "Demo", slug: "demo", expiresAt: new Date("2099-01-01"),
    owner: { username: "owner" }, tags: [], _count: { deployments: 2 } };
  return { deployments, space };
});
vi.mock("./db", () => ({ prisma: {
  space: {
    findUnique: async () => ({ ...fixture.space, deployments: fixture.deployments.filter(d => d.spaceId === "s1" && !d.deletedAt) }),
    findMany: async () => [fixture.space, { ...fixture.space, id: "empty", _count: { deployments: 0 } }],
  },
  deployment: {
    findMany: async ({ where }: any) => fixture.deployments.filter(d => d.spaceId === where.spaceId && !d.deletedAt),
    groupBy: async ({ where }: any) => {
      const totals = new Map<string, number>();
      for (const d of fixture.deployments) {
        if (!where.spaceId.in.includes(d.spaceId) || (where.deletedAt === null && d.deletedAt)) continue;
        if (where.visibility && d.visibility !== where.visibility) continue;
        totals.set(d.spaceId, (totals.get(d.spaceId) ?? 0) + d.viewCount);
      }
      return [...totals].map(([spaceId, total]) => ({ spaceId, _sum: { viewCount: total } }));
    },
  },
  spaceTag: { findMany: async () => [] },
} }));
vi.mock("./middleware", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.authUser = { userId: "owner", username: "owner" }; next(); },
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

describe("space view totals", () => {
  let app: express.Express;
  beforeEach(() => { app = express().use("/api/spaces", spaceRouter).use("/api/admin", adminRouter); });

  it.each(["/api/spaces", "/api/admin/spaces"])("returns totals and zero for empty spaces in %s", async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.body.map((space: any) => space.viewCount)).toEqual([10, 0]);
  });

  it("includes hidden works in the public total without exposing hidden works", async () => {
    const res = await request(app).get("/api/spaces/entry/demo");
    expect(res.status).toBe(200);
    expect(res.body.space.viewCount).toBe(10);
    expect(res.body.deployments.map((d: any) => d.id)).toEqual(["visible"]);
  });

  it.each(["/api/spaces/s1", "/api/admin/spaces/s1"])("returns the same total in %s", async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.body.viewCount).toBe(10);
  });
});
