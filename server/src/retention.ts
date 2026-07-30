export const ANONYMOUS_DAYS = 1;
export const MAX_PERSONAL_DAYS = 30;
export const MAX_SPACE_DAYS = 365;
export const SPACE_EXTENSION_DAYS = 365;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
