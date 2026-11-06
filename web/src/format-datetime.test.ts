import { expect, it } from "vitest";
import { formatDateTime } from "./format-datetime";

it("uses zero-padded local dates and a 24-hour clock independently of locale", () => {
  expect(formatDateTime(new Date(2026, 0, 2, 0, 5, 9))).toBe("2026-01-02 00:05:09");
  expect(formatDateTime(new Date(2026, 10, 13, 21, 5, 24).toISOString())).toBe("2026-11-13 21:05:24");
  expect(formatDateTime("not-a-date")).toBe("—");
});
