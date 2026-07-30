// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, setAuthToken } from "../api";
import { DashboardPage } from "./DashboardPage";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  setAuthToken: vi.fn(),
}));

const activeDeployment = {
  id: "d1",
  title: "个人首页",
  publicSlug: "personal-home",
  visibility: "visible",
  createdAt: "2026-07-29T01:00:00.000Z",
  expiresAt: "2099-07-30T01:00:00.000Z",
  deletedAt: null,
};

function renderPage() {
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("token", "user-token");
  localStorage.setItem("user", JSON.stringify({
    id: "u1",
    username: "member",
    role: "USER",
  }));
});

afterEach(cleanup);

describe("DashboardPage", () => {
  it("shows personal upload history in a table and distinguishes inactive entries", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") {
        return {
          data: [
            activeDeployment,
            { ...activeDeployment, id: "d2", title: "隐藏网页", visibility: "hidden" },
            {
              ...activeDeployment,
              id: "d3",
              title: "过期网页",
              visibility: "hidden",
              expiresAt: "2020-01-01T00:00:00.000Z",
            },
            {
              ...activeDeployment,
              id: "d4",
              title: "删除网页",
              visibility: "hidden",
              expiresAt: "2020-01-01T00:00:00.000Z",
              deletedAt: "2026-07-29T02:00:00.000Z",
            },
          ],
        };
      }
      if (url === "/spaces") return { data: [] };
      throw new Error(`unexpected GET ${url}`);
    });

    renderPage();

    expect(screen.getByRole("button", { name: "我的上传" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "空间管理" })).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "网页" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "上传时间" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "到期时间" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();

    const activeRow = screen.getByText("个人首页").closest("tr")!;
    const hiddenRow = screen.getByText("隐藏网页").closest("tr")!;
    const expiredRow = screen.getByText("过期网页").closest("tr")!;
    const deletedRow = screen.getByText("删除网页").closest("tr")!;

    expect(within(activeRow).getByText("正常")).toBeInTheDocument();
    expect(within(hiddenRow).getByText("已隐藏")).toBeInTheDocument();
    expect(within(expiredRow).getByText("已过期")).toBeInTheDocument();
    expect(within(deletedRow).getByText("已删除")).toBeInTheDocument();
    expect(within(activeRow).getByRole("link", { name: "访问个人首页" })).toHaveAttribute(
      "href",
      "/p/personal-home",
    );
    expect(within(hiddenRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(expiredRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(deletedRow).queryByRole("link")).not.toBeInTheDocument();
  });

  it("opens a modal instead of showing an inline space form", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") return { data: [] };
      if (url === "/spaces") {
        return {
          data: [{
            id: "s1",
            name: "作品空间",
            slug: "portfolio",
            createdAt: "2026-07-29T01:00:00.000Z",
          }],
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    const user = userEvent.setup();

    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/deployments"));
    await user.click(screen.getByRole("button", { name: "空间管理" }));

    expect(await screen.findByText("作品空间")).toBeInTheDocument();
    expect(screen.queryByLabelText("空间名称")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建空间" }));
    expect(screen.getByRole("dialog", { name: "新建空间" })).toBeInTheDocument();
  });

  it("clears the account when the user logs out", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(setAuthToken).toHaveBeenCalledWith();
  });
});
