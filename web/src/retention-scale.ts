export const DEFAULT_DURATION_DAYS = 1;
export const MAX_ANONYMOUS_DAYS = 3;
export const MAX_PERSONAL_DAYS = 30;

/** Visible day labels on the 1–30 track, spaced by actual day proportion. */
export const RETENTION_SCALE_TICKS = [1, 3, 7, 14, 21, 30] as const;

/** Position of a day on the 1–30 track, proportional to actual day count. */
export const ANONYMOUS_LIMIT_RATIO = (MAX_ANONYMOUS_DAYS - 1) / (MAX_PERSONAL_DAYS - 1);

export function daysToRatio(days: number): number {
  const value = Math.min(MAX_PERSONAL_DAYS, Math.max(1, days));
  return (value - 1) / (MAX_PERSONAL_DAYS - 1);
}

export function ratioToDays(ratio: number): number {
  const value = Math.min(1, Math.max(0, ratio));
  return Math.round(1 + value * (MAX_PERSONAL_DAYS - 1));
}

export function clampDurationDays(days: number, maxDays: number): number {
  if (!Number.isFinite(days)) {
    return DEFAULT_DURATION_DAYS;
  }
  return Math.min(maxDays, Math.max(1, Math.round(days)));
}
