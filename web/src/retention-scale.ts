export const DEFAULT_DURATION_DAYS = 1;
export const MAX_ANONYMOUS_DAYS = 3;
export const MAX_PERSONAL_DAYS = 30;

/** Days 1–3 occupy the first third of the track; days 3–30 occupy the rest. */
export const ANONYMOUS_LIMIT_RATIO = 1 / 3;

export function daysToRatio(days: number): number {
  const value = Math.min(MAX_PERSONAL_DAYS, Math.max(1, days));
  if (value <= MAX_ANONYMOUS_DAYS) {
    return ((value - 1) / (MAX_ANONYMOUS_DAYS - 1)) * ANONYMOUS_LIMIT_RATIO;
  }
  return ANONYMOUS_LIMIT_RATIO
    + ((value - MAX_ANONYMOUS_DAYS) / (MAX_PERSONAL_DAYS - MAX_ANONYMOUS_DAYS))
      * (1 - ANONYMOUS_LIMIT_RATIO);
}

export function ratioToDays(ratio: number): number {
  const value = Math.min(1, Math.max(0, ratio));
  if (value <= ANONYMOUS_LIMIT_RATIO) {
    return Math.round(1 + (value / ANONYMOUS_LIMIT_RATIO) * (MAX_ANONYMOUS_DAYS - 1));
  }
  return Math.round(
    MAX_ANONYMOUS_DAYS
      + ((value - ANONYMOUS_LIMIT_RATIO) / (1 - ANONYMOUS_LIMIT_RATIO))
        * (MAX_PERSONAL_DAYS - MAX_ANONYMOUS_DAYS),
  );
}

export function clampDurationDays(days: number, maxDays: number): number {
  if (!Number.isFinite(days)) {
    return DEFAULT_DURATION_DAYS;
  }
  return Math.min(maxDays, Math.max(1, Math.round(days)));
}
