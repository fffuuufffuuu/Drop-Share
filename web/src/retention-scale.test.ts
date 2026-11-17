import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_LIMIT_RATIO,
  clampDurationDays,
  daysToRatio,
  DEFAULT_DURATION_DAYS,
  MAX_ANONYMOUS_DAYS,
  MAX_PERSONAL_DAYS,
  ratioToDays,
  RETENTION_SCALE_TICKS,
} from "./retention-scale";

describe("retention scale", () => {
  it("exposes readable tick marks at actual day positions", () => {
    expect([...RETENTION_SCALE_TICKS]).toEqual([1, 3, 7, 14, 21, 30]);
    expect(RETENTION_SCALE_TICKS.map(daysToRatio)).toEqual([
      0,
      2 / 29,
      6 / 29,
      13 / 29,
      20 / 29,
      1,
    ]);
  });

  it("maps days onto the track in proportion to the 1–30 range", () => {
    expect(daysToRatio(1)).toBe(0);
    expect(daysToRatio(MAX_ANONYMOUS_DAYS)).toBeCloseTo(ANONYMOUS_LIMIT_RATIO);
    expect(daysToRatio(MAX_ANONYMOUS_DAYS)).toBeCloseTo(2 / 29);
    expect(daysToRatio(16)).toBeCloseTo(15 / 29);
    expect(daysToRatio(MAX_PERSONAL_DAYS)).toBe(1);
  });

  it("round-trips every whole day on the personal scale", () => {
    for (let days = 1; days <= MAX_PERSONAL_DAYS; days += 1) {
      expect(ratioToDays(daysToRatio(days))).toBe(days);
    }
  });

  it("clamps values to the allowed range", () => {
    expect(clampDurationDays(0, MAX_ANONYMOUS_DAYS)).toBe(1);
    expect(clampDurationDays(4, MAX_ANONYMOUS_DAYS)).toBe(MAX_ANONYMOUS_DAYS);
    expect(clampDurationDays(30, MAX_ANONYMOUS_DAYS)).toBe(MAX_ANONYMOUS_DAYS);
    expect(clampDurationDays(1.4, MAX_PERSONAL_DAYS)).toBe(1);
    expect(clampDurationDays(30, MAX_PERSONAL_DAYS)).toBe(MAX_PERSONAL_DAYS);
    expect(clampDurationDays(Number.NaN, MAX_PERSONAL_DAYS)).toBe(DEFAULT_DURATION_DAYS);
  });
});
