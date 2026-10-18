// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCloudbaseSession, refreshCloudbaseSession, storeCloudbaseSession } from "./cloudbase-session";
const session = { token: "old", refreshToken: "refresh-old", expiresIn: 1, user: { id: "u", username: "teacher", role: "USER" as const, createdAt: "now" } };
beforeEach(() => { localStorage.clear(); });
describe("CloudBase session lifecycle", () => {
  it("coalesces concurrent refreshes and persists the rotated refresh token", async () => {
    storeCloudbaseSession(session);
    const exchange = vi.fn().mockResolvedValue({ ...session, token: "new", refreshToken: "refresh-new", expiresIn: 7200 });
    const result = await Promise.all([refreshCloudbaseSession(exchange), refreshCloudbaseSession(exchange)]);
    expect(exchange).toHaveBeenCalledTimes(1); expect(result).toEqual(["new", "new"]);
    expect(localStorage.getItem("token")).toBe("new");
    expect(localStorage.getItem("cloudbaseSession")).toContain("refresh-new");
  });
  it("does not resurrect a session when logout happens during a refresh", async () => {
    storeCloudbaseSession(session);
    let resolve: any; const pending = refreshCloudbaseSession(() => new Promise(r => { resolve = r; }));
    await Promise.resolve(); clearCloudbaseSession(); resolve({ ...session, token: "new", refreshToken: "new-refresh" });
    await pending; expect(localStorage.getItem("token")).toBeNull(); expect(localStorage.getItem("cloudbaseSession")).toBeNull();
  });
  it("does not erase a newly logged-in session when an old refresh fails", async () => {
    storeCloudbaseSession(session);
    let reject: any; const pending = refreshCloudbaseSession(() => new Promise((_resolve, r) => { reject = r; }), () => true);
    await Promise.resolve(); storeCloudbaseSession({ ...session, token: "other-account", refreshToken: "other-refresh", expiresIn: 7200 });
    reject(new Error("old refresh rejected")); await expect(pending).rejects.toThrow();
    expect(localStorage.getItem("token")).toBe("other-account");
    expect(localStorage.getItem("cloudbaseSession")).toContain("other-refresh");
  });
  it("clears only the matching session when its refresh is definitively rejected", async () => {
    storeCloudbaseSession(session);
    await expect(refreshCloudbaseSession(async () => { throw new Error("invalid grant"); }, () => true)).rejects.toThrow();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("cloudbaseSession")).toBeNull();
  });
});
