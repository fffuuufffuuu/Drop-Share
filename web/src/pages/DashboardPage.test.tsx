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
    patch: vi.fn(),
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

const activeSpaceDeployment = {
  ...activeDeployment,
  id: "sd1",
  title: "空间作品",
  publicSlug: "space-work",
  space: {
    id: "s1",
    name: "作品空间",
    slug: "portfolio",
  },
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
  it("splits accessible personal and space uploads into two work sections", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") {
        return {
          data: [
            activeDeployment,
            {
              ...activeDeployment, id: "d2", title: "过期网页",
              expiresAt: "2020-01-01T00:00:00.000Z",
            },
          ],
        };
      }
      if (url === "/deployments/space-uploads") {
        return { data: [activeSpaceDeployment] };
      }
      if (url === "/spaces") return { data: [] };
      throw new Error(`unexpected GET ${url}`);
    });

    renderPage();

    expect(screen.getByRole("button", { name: "我的上传" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "空间管理" })).toBeInTheDocument();
    const personalSection = await screen.findByRole("region", { name: "个人作品" });
    const spaceSection = screen.getByRole("region", { name: "在空间里上传的作品" });
    expect(within(personalSection).getByRole("heading", { name: "个人首页" }))
      .toBeInTheDocument();
    expect(within(personalSection).queryByText("过期网页")).not.toBeInTheDocument();
    expect(within(spaceSection).getByRole("heading", { name: "空间作品" }))
      .toBeInTheDocument();
    expect(within(spaceSection).getByRole("link", { name: "作品空间" }))
      .toHaveAttribute("href", "/s/portfolio");
    expect(within(spaceSection).queryByText("所在空间：")).not.toBeInTheDocument();
    expect(within(spaceSection).getByRole("link", { name: "打开空间作品" }))
      .toHaveClass("work-preview-open-overlay");
    expect(api.get).toHaveBeenCalledWith("/deployments");
    expect(api.get).toHaveBeenCalledWith("/deployments/space-uploads");
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
      if (url === "/deployments/space-uploads") return { data: [] };
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
      "空间",
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
    expect(within(activeRow).getByRole("button", { name: "进入作品空间管理" })).toBeInTheDocument();
    expect(within(activeRow).getByRole("link", { name: "作品空间" })).toHaveAttribute("href", "/s/portfolio");
    expect(within(activeRow).queryByRole("button", { name: "入口页面" })).not.toBeInTheDocument();
    for (const name of ["修改作品空间名称", "进入作品空间管理", "为作品空间延长一年", "删除作品空间"]) {
      const button = within(activeRow).getByRole("button", { name });
      expect(button).toHaveClass("work-icon-action");
      expect(button.querySelector("svg")).toBeInTheDocument();
    }
    expect(within(expiredRow).getByText("已过期")).toBeInTheDocument();
    expect(within(expiredRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(expiredRow).queryByRole("button", { name: "为过期空间延长一年" }))
      .not.toBeInTheDocument();

    await user.click(within(activeRow).getByRole("button", { name: "为作品空间延长一年" }));
    expect(api.post).toHaveBeenCalledWith("/spaces/s1/extend");
    expect(await screen.findByText(new Date("2100-07-30T01:00:00.000Z").toLocaleString()))
      .toBeInTheDocument();
  });

  it("only enters the dedicated space management page", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments" || url === "/deployments/space-uploads") return { data: [] };
      if (url === "/spaces") return { data: [{
        id: "s1", name: "作品空间", slug: "portfolio", createdAt: "2026-07-29T01:00:00.000Z",
        expiresAt: "2099-07-30T01:00:00.000Z", deploymentCount: 1,
      }] };
      if (url === "/spaces/s1") return { data: {
        id: "s1", name: "作品空间",
        tags: [{ id: "t1", spaceId: "s1", name: "物理", createdAt: "2026-07-29T01:00:00.000Z" }],
        deployments: [{ id: "d1", title: "轨道演示", publicSlug: "orbit", tagIds: ["t1"], uploaderName: "member" }],
      } };
      throw new Error(`unexpected GET ${url}`);
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "空间管理" }));
    expect(await screen.findByRole("button", { name: "进入作品空间管理" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "管理作品" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "作品空间的作品管理" })).not.toBeInTheDocument();
  });

  it("opens a modal instead of showing an inline space form", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") return { data: [] };
      if (url === "/deployments/space-uploads") return { data: [] };
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
      if (url === "/deployments/space-uploads") return { data: [] };
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

  it("renames personal and owned space uploads from their cards", async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/deployments") return { data: [activeDeployment] };
      if (url === "/deployments/space-uploads") return { data: [activeSpaceDeployment] };
      throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "重命名个人首页" }));
    expect(screen.getByRole("dialog", { name: "重命名作品" })).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "项目名称" }));
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "新的个人首页");
    await user.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/deployments/d1", { title: "新的个人首页" },
    ));
    expect(await screen.findByRole("heading", { name: "新的个人首页" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重命名空间作品" }));
    await user.clear(screen.getByRole("textbox", { name: "项目名称" }));
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "新的空间作品");
    await user.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/deployments/sd1", { title: "新的空间作品" },
    ));
    expect(await screen.findByRole("heading", { name: "新的空间作品" })).toBeInTheDocument();
  });

  it("shows the admin entry only to an administrator", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderPage();
    expect(screen.queryByRole("link", { name: "管理后台" })).not.toBeInTheDocument();

    cleanup();
    localStorage.setItem("user", JSON.stringify({
      id: "admin-1",
      username: "fffuuu",
      role: "ADMIN",
    }));
    renderPage();

    expect(await screen.findByRole("link", { name: "管理后台" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });
});
