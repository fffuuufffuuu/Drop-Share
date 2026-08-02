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
    delete: vi.fn(),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it("shows spaces in a table and extends only an active space", async () => {
    const activeSpace = {
      id: "s1",
      name: "作品空间",
      slug: "portfolio",
      createdAt: "2026-07-29T01:00:00.000Z",
      expiresAt: "2099-07-30T01:00:00.000Z",
      deploymentCount: 4,
    };
    const expiredSpace = {
      ...activeSpace,
      id: "s2",
      name: "过期空间",
      slug: "expired",
      expiresAt: "2020-01-01T00:00:00.000Z",
      deploymentCount: 0,
    };
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") return { data: [] };
      if (url === "/spaces") {
        return { data: [activeSpace, expiredSpace] };
      }
      throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(api.post).mockResolvedValue({
      data: {
        ...activeSpace,
        expiresAt: "2100-07-30T01:00:00.000Z",
      },
    });
    const user = userEvent.setup();

    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/deployments"));
    await user.click(screen.getByRole("button", { name: "空间管理" }));

    for (const heading of [
      "空间名称",
      "网址后缀",
      "作品数量",
      "到期时间",
      "状态",
      "操作",
    ]) {
      expect(await screen.findByRole("columnheader", { name: heading })).toBeInTheDocument();
    }

    const activeRow = screen.getByText("作品空间").closest("tr")!;
    const expiredRow = screen.getByText("过期空间").closest("tr")!;
    expect(within(activeRow).getByText("4")).toBeInTheDocument();
    expect(within(activeRow).getByText("有效")).toBeInTheDocument();
    expect(within(activeRow).getByRole("link", { name: "进入管理" })).toBeInTheDocument();
    expect(within(activeRow).getByRole("link", { name: "入口页面" })).toBeInTheDocument();
    expect(within(activeRow).getByRole("button", { name: "延长一年" })).toBeInTheDocument();
    expect(within(expiredRow).getByText("已过期")).toBeInTheDocument();
    expect(within(expiredRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(expiredRow).queryByRole("button", { name: "延长一年" }))
      .not.toBeInTheDocument();

    await user.click(within(activeRow).getByRole("button", { name: "延长一年" }));
    expect(api.post).toHaveBeenCalledWith("/spaces/s1/extend");
    expect(await screen.findByText(new Date("2100-07-30T01:00:00.000Z").toLocaleString()))
      .toBeInTheDocument();
  });

  it("opens a modal instead of showing an inline space form", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") return { data: [] };
      if (url === "/spaces") return { data: [] };
      throw new Error(`unexpected GET ${url}`);
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "空间管理" }));

    expect(screen.queryByLabelText("空间名称")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建空间" }));
    expect(screen.getByRole("dialog", { name: "新建空间" })).toBeInTheDocument();
  });

  it("confirms and permanently deletes active or expired spaces", async () => {
    const spaces = [
      {
        id: "s1",
        name: "作品空间",
        slug: "portfolio",
        createdAt: "2026-07-29T01:00:00.000Z",
        expiresAt: "2099-07-30T01:00:00.000Z",
        deploymentCount: 4,
      },
      {
        id: "s2",
        name: "过期空间",
        slug: "expired",
        createdAt: "2026-07-29T01:00:00.000Z",
        expiresAt: "2020-01-01T00:00:00.000Z",
        deploymentCount: 0,
      },
    ];
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") return { data: [] };
      if (url === "/spaces") return { data: spaces };
      throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(api.delete).mockResolvedValue({
      data: { message: "空间已永久删除" },
    });
    vi.spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "空间管理" }));

    const activeRow = (await screen.findByText("作品空间")).closest("tr")!;
    const expiredRow = screen.getByText("过期空间").closest("tr")!;
    expect(within(activeRow).getByRole("button", { name: "删除作品空间" }))
      .toBeInTheDocument();
    expect(within(expiredRow).getByRole("button", { name: "删除过期空间" }))
      .toBeInTheDocument();

    await user.click(within(activeRow).getByRole("button", { name: "删除作品空间" }));
    expect(api.delete).not.toHaveBeenCalled();

    await user.click(within(expiredRow).getByRole("button", { name: "删除过期空间" }));
    expect(window.confirm).toHaveBeenLastCalledWith(
      "此操作将永久删除该空间及其中全部作品，无法恢复。确定继续吗？",
    );
    expect(api.delete).toHaveBeenCalledWith("/spaces/s2");
    await waitFor(() => {
      expect(screen.queryByText("过期空间")).not.toBeInTheDocument();
    });
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
