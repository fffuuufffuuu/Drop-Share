import { describe, expect, it } from "vitest";

import { formatLocaleDateTime } from "./format-datetime";

describe("formatLocaleDateTime", () => {
  it("formats timestamps with zh-CN ordering and hyphenated dates", () => {
    expect(formatLocaleDateTime("2026-11-13T00:05:35.000Z")).toMatch(
      /^2026-11-13 \d{2}:\d{2}:\d{2}$/,
    );
  });
});
