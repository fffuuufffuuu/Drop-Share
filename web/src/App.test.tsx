// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";
import App from "./App";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
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

  it("shows the admin link immediately after an administrator logs in", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: {
        token: "admin-token",
        user: {
          id: "u1",
          username: "fffuuu",
          role: "ADMIN",
          createdAt: "2026-07-29T01:00:00.000Z",
        },
      },
    });
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByRole("textbox"), "fffuuu");
    await user.type(document.querySelector('input[type="password"]')!, "password123");
    const loginButtons = screen.getAllByRole("button", { name: "登录" });
    await user.click(loginButtons[loginButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "管理后台" })).toHaveAttribute("href", "/admin");
    });
  });
});
