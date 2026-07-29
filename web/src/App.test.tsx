// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

function renderApp(initialEntry = "/login") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

describe("homepage and account navigation", () => {
  it("uses the landing page at root and keeps the uploader at /upload", () => {
    renderApp("/");

    expect(screen.getByRole("link", { name: "Drop & Share" })).toHaveAttribute("href", "/");
    expect(within(screen.getByRole("navigation")).queryByText("首页")).not.toBeInTheDocument();
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", {
      name: "随时部署，随时分享。",
    })).toBeInTheDocument();
    expect(main.getByRole("link", { name: "免费使用" })).toHaveAttribute("href", "/upload");
  });

  it("shows login and registration together to a visitor", () => {
    renderApp("/");

    const navigation = within(screen.getByRole("navigation"));
    expect(navigation.getByRole("link", { name: "登录/注册" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("replaces login and registration with the username after login", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));

    renderApp("/");

    const navigation = within(screen.getByRole("navigation"));
    expect(navigation.getByRole("link", { name: "member" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(navigation.queryByRole("link", { name: "登录/注册" })).not.toBeInTheDocument();
  });
});

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
