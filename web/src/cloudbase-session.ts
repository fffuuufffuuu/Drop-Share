import type { AuthResponse } from "./types";
import { notifyAuthChanged } from "./auth";

export const cloudbaseSessionKey = "cloudbaseSession";
type StoredSession = { refreshToken: string; expiresAt: number };
let pending: Promise<string | undefined> | undefined;
function readSession(): StoredSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(cloudbaseSessionKey) ?? "null");
    return typeof value?.refreshToken === "string" && typeof value?.expiresAt === "number" ? value : null;
  } catch { return null; }
}
export function storeCloudbaseSession(data: AuthResponse): void {
  if (!data.refreshToken || !data.expiresIn) throw new Error("认证响应缺少会话信息");
  localStorage.setItem(cloudbaseSessionKey, JSON.stringify({ refreshToken: data.refreshToken, expiresAt: Date.now() + data.expiresIn * 1000 }));
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  notifyAuthChanged();
}
export function clearCloudbaseSession(): void {
  localStorage.removeItem(cloudbaseSessionKey);
  localStorage.removeItem("token"); localStorage.removeItem("user");
}
export function needsCloudbaseRefresh(): boolean {
  const value = readSession(); return !!value && value.expiresAt < Date.now() + 60000;
}
export function hasCloudbaseSession(): boolean { return !!readSession(); }

export async function refreshCloudbaseSession(exchange: (refreshToken: string) => Promise<AuthResponse>, isInvalidSession: (error: unknown) => boolean = () => false): Promise<string | undefined> {
  if (pending) return pending;
  const run = async () => {
    const start = readSession(); if (!start) return undefined;
    // Another tab may already have rotated the token while this tab waited for the lock.
    if (!needsCloudbaseRefresh()) return localStorage.getItem("token") ?? undefined;
    let data: AuthResponse;
    try { data = await exchange(start.refreshToken); }
    catch (error) {
      if (readSession()?.refreshToken === start.refreshToken && isInvalidSession(error)) { clearCloudbaseSession(); notifyAuthChanged(); }
      throw error;
    }
    if (readSession()?.refreshToken !== start.refreshToken) return localStorage.getItem("token") ?? undefined;
    storeCloudbaseSession(data); return data.token;
  };
  pending = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request("drop-share-token-refresh", run);
    return await run();
  })();
  try { return await pending; } finally { pending = undefined; }
}
