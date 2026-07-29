// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, setAuthToken } from "../api";
import { AdminPage } from "./AdminPage";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    delete: vi.fn(),
  },
  setAuthToken: vi.fn(),
}));

const personalDeployments = [
  {
    id: "d1",
    title: "匿名作品",
    publicSlug: "anonymous-site",
    ownerLabel: "匿名",
    visibility: "visible",
    createdAt: "2026-07-29T01:00:00.000Z",
    expiresAt: "2026-07-30T01:00:00.000Z",
  },
];

const spaces = [
  {
    id: "s1",
    name: "作品空间",
    slug: "portfolio",
    ownerUsername: "owner",
    createdAt: "2026-07-29T01:00:00.000Z",
    deploymentCount: 1,
  },
];

const spaceDetail = {
  ...spaces[0],
  deployments: [
    {
      ...personalDeployments[0],
      id: "sd1",
      title: "空间首页",
      ownerLabel: "owner",
    },
  ],
};

function setAdmin() {
  localStorage.setItem("token", "admin-token");
  localStorage.setItem("user", JSON.stringify({
    id: "u1",
    username: "fffuuu",
    role: "ADMIN",
  }));
}

function renderPage() {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

function mockInventory() {
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === "/admin/deployments/personal") return { data: personalDeployments };
    if (url === "/admin/spaces") return { data: spaces };
    if (url === "/admin/spaces/s1") return { data: spaceDetail };
    throw new Error(`unexpected GET ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:admin-download");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminPage", () => {
  it("blocks an ordinary user without requesting inventory", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));

    renderPage();

    expect(screen.getByRole("heading", { name: "仅管理员可访问" })).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows both panels and labels anonymous uploads", async () => {
    setAdmin();
    mockInventory();

    renderPage();

    expect(setAuthToken).toHaveBeenCalledWith("admin-token");
    expect(screen.getByRole("button", { name: "个人上传" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "空间" })).toBeInTheDocument();
    expect(await screen.findByText("匿名作品")).toBeInTheDocument();
    expect(screen.getByText("匿名")).toBeInTheDocument();
  });

  it("loads a selected space detail", async () => {
    setAdmin();
    mockInventory();
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "空间" }));
    await user.click(await screen.findByRole("button", { name: "查看作品空间详情" }));

    expect(await screen.findByText("空间首页")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/spaces/s1");
  });

  it("downloads a deployment Blob through the browser", async () => {
    setAdmin();
    mockInventory();
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/admin/deployments/personal") return { data: personalDeployments };
      if (url === "/admin/deployments/d1/download" && config?.responseType === "blob") {
        return {
          data: new Blob(["zip"]),
          headers: { "content-disposition": "attachment; filename=\"anonymous.zip\"" },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    renderPage();
    await user.click(await screen.findByRole("button", { name: "下载匿名作品 ZIP" }));

    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:admin-download");
    });
  });

  it("asks for confirmation before deleting a deployment", async () => {
    setAdmin();
    mockInventory();
    vi.mocked(api.delete).mockResolvedValue({ data: { message: "网页已永久删除" } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole("button", { name: "永久删除匿名作品" }));

    expect(screen.getByText(/删除后文件无法恢复/)).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认永久删除" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/admin/deployments/d1"));
  });

  it("shows a stronger warning before deleting a space", async () => {
    setAdmin();
    mockInventory();
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "空间" }));
    await user.click(await screen.findByRole("button", { name: "永久删除空间作品空间" }));

    expect(screen.getByText(/空间及其中所有网页都会永久删除/)).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
