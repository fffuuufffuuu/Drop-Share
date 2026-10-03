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
      name: "一键部署，随时分享。",
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

  it("replaces login and registration with a my-works link after login", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));

    renderApp("/");

    const navigation = within(screen.getByRole("navigation"));
    expect(navigation.getByRole("link", { name: "我的作品" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(navigation.queryByText("member")).not.toBeInTheDocument();
    expect(navigation.queryByRole("link", { name: "登录/注册" })).not.toBeInTheDocument();
  });

  it("links the footer to CashewLab and this project's GitHub repository", () => {
    renderApp("/");

    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByText(/作者：/)).toHaveTextContent("作者：CashewLab");
    expect(footer.getByRole("link", { name: "CashewLab" })).toHaveAttribute(
      "href",
      "https://www.yaoguosir.com/",
    );
    expect(footer.getByText("沪ICP备2025130631号-1")).toBeInTheDocument();
    expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/fffuuufffuuu/Drop-Share",
    );
  });
});

describe("authentication destinations", () => {
  const authResponse = {
    token: "user-token",
    user: {
      id: "u2",
      username: "member",
      role: "USER",
      createdAt: "2026-07-29T01:00:00.000Z",
    },
  };

  it("opens the uploader after login", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: authResponse });
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    renderApp("/login");
    await user.type(screen.getByRole("textbox", { name: "用户名" }), "member");
    await user.type(screen.getByLabelText("密码"), "password123");
    const loginButtons = screen.getAllByRole("button", { name: "登录" });
    await user.click(loginButtons[loginButtons.length - 1]);

    expect(
      await screen.findByRole("heading", { name: "上传并部署" }),
    ).toBeInTheDocument();
  });

  it("selects registration from the URL and opens the uploader afterward", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: authResponse });
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    renderApp("/login?mode=register");
    expect(screen.getByRole("heading", { name: "账号注册" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "用户名" }), "member");
    await user.type(screen.getByPlaceholderText("至少 8 位"), "password123");
    await user.type(screen.getByLabelText("确认密码"), "password123");
    await user.click(screen.getByRole("button", { name: "注册并登录" }));

    expect(
      await screen.findByRole("heading", { name: "上传并部署" }),
    ).toBeInTheDocument();
  });

  it("ignores an external post-login destination", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: authResponse });
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    renderApp("/login?next=https%3A%2F%2Fexample.com");
    await user.type(screen.getByRole("textbox", { name: "用户名" }), "member");
    await user.type(screen.getByLabelText("密码"), "password123");
    const loginButtons = screen.getAllByRole("button", { name: "登录" });
    await user.click(loginButtons[loginButtons.length - 1]);

    expect(
      await screen.findByRole("heading", { name: "上传并部署" }),
    ).toBeInTheDocument();
  });
});

describe("administrator navigation", () => {
  it("does not show the admin link in the footer or top navigation", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u1",
      username: "fffuuu",
      role: "ADMIN",
    }));

    renderApp();

    expect(within(screen.getByRole("navigation")).queryByRole("link", { name: "管理后台" }))
      .not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).queryByRole("link", { name: "管理后台" }))
      .not.toBeInTheDocument();
  });

  it("does not show the admin link to an ordinary user", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));

    renderApp();

    expect(within(screen.getByRole("contentinfo")).queryByRole("link", { name: "管理后台" }))
      .not.toBeInTheDocument();
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

    await user.click(await within(screen.getByRole("navigation")).findByRole("link", { name: "我的作品" }));
    await waitFor(() => {
      expect(within(screen.getByRole("main")).getByRole("link", { name: "管理后台" }))
        .toHaveAttribute("href", "/admin");
    });
    expect(within(screen.getByRole("contentinfo")).queryByRole("link", { name: "管理后台" }))
      .not.toBeInTheDocument();
  });
});
