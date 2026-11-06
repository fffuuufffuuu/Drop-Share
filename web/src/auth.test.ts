// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { getCurrentUser, isAuthenticated, loginDestinationFromNext, loginPathWithNext } from "./auth";

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

describe("login redirects", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("accepts safe post-login destinations", () => {
    expect(loginDestinationFromNext("/dashboard")).toBe("/dashboard");
    expect(loginDestinationFromNext("/upload?createSpace=1")).toBe("/upload?createSpace=1");
    expect(loginDestinationFromNext("https://evil.example")).toBe("/upload");
  });

  it("builds login links for protected pages", () => {
    expect(loginPathWithNext("/dashboard")).toBe("/login?next=%2Fdashboard");
  });

  it("requires both user and token to count as authenticated", () => {
    localStorage.setItem("user", JSON.stringify({ id: "u1", username: "member", role: "USER" }));
    expect(isAuthenticated()).toBe(false);
    localStorage.setItem("token", "token");
    expect(isAuthenticated()).toBe(true);
  });
});
