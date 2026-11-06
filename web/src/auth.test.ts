// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { getCurrentUser } from "./auth";

describe("getCurrentUser", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("reads a valid administrator", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u1",
      username: "fffuuu",
      role: "ADMIN",
    }));

    expect(getCurrentUser()).toEqual({
      id: "u1",
      username: "fffuuu",
      role: "ADMIN",
    });
  });

  it("reads a valid ordinary user", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));

    expect(getCurrentUser()?.role).toBe("USER");
  });

  it("treats a legacy user without a role as ordinary", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u3",
      username: "legacy",
    }));

    expect(getCurrentUser()?.role).toBe("USER");
  });

  it("returns null for malformed JSON", () => {
    localStorage.setItem("user", "{broken");

    expect(getCurrentUser()).toBeNull();
  });

  it("returns null when storage has no user", () => {
    expect(getCurrentUser()).toBeNull();
  });
});
