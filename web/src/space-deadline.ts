const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function isDeadlineNear(expiresAt: string, now = Date.now()): boolean {
  const remaining = new Date(expiresAt).getTime() - now;
  return Number.isFinite(remaining) && remaining <= MONTH_MS;
}
