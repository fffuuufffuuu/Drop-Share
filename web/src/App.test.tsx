// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import App from "./App";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderApp() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("administrator navigation", () => {
  it("shows the admin link to an administrator", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u1",
      username: "fffuuu",
      role: "ADMIN",
    }));

    renderApp();

    expect(screen.getByRole("link", { name: "管理后台" })).toHaveAttribute("href", "/admin");
  });

  it("does not show the admin link to an ordinary user", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));

    renderApp();

    expect(screen.queryByRole("link", { name: "管理后台" })).not.toBeInTheDocument();
  });
});
