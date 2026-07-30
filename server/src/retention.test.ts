import { describe, expect, it } from "vitest";

import { addDays, isExpired } from "./retention";

describe("retention", () => {
  it("adds whole days without mutating the source date", () => {
    const source = new Date("2026-07-30T01:00:00.000Z");

    expect(addDays(source, 30).toISOString()).toBe("2026-08-29T01:00:00.000Z");
    expect(source.toISOString()).toBe("2026-07-30T01:00:00.000Z");
  });

  it("treats the exact cutoff as expired", () => {
    const cutoff = new Date("2026-07-31T01:00:00.000Z");

    expect(isExpired(cutoff, new Date("2026-07-31T01:00:00.000Z"))).toBe(true);
    expect(isExpired(cutoff, new Date("2026-07-31T00:59:59.999Z"))).toBe(false);
  });
});
