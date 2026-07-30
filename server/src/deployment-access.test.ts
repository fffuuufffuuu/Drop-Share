import { describe, expect, it } from "vitest";

import { isDeploymentAvailable } from "./deployment-access";

const now = new Date("2026-07-30T01:00:00.000Z");

describe("deployment availability", () => {
  it("uses personal expiration when no space exists", () => {
    expect(isDeploymentAvailable({
      deletedAt: null,
      visibility: "visible",
      expiresAt: new Date("2026-07-31T01:00:00.000Z"),
      space: null,
    }, now)).toBe(true);
  });

  it("uses only the parent space expiration for space work", () => {
    expect(isDeploymentAvailable({
      deletedAt: null,
      visibility: "visible",
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      space: { expiresAt: new Date("2026-07-31T01:00:00.000Z") },
    }, now)).toBe(true);
  });

  it("rejects work when its parent space has expired", () => {
    expect(isDeploymentAvailable({
      deletedAt: null,
      visibility: "visible",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      space: { expiresAt: new Date("2026-07-30T01:00:00.000Z") },
    }, now)).toBe(false);
  });
});
