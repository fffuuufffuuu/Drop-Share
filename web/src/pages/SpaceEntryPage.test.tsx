// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { SpaceEntryPage } from "./SpaceEntryPage";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderSpaceEntry() {
  render(
    <MemoryRouter initialEntries={["/s/demo"]}>
      <Routes>
        <Route path="/s/:spaceSlug" element={<SpaceEntryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SpaceEntryPage upload selection", () => {
  it("shows the owner and administrator the correct management entry", async () => {
    const payload = { space: { id: "space-1", ownerUserId: "owner", name: "作品空间", slug: "demo", expiresAt: "2099-01-01" }, tags: [], deployments: [] };
    vi.spyOn(api, "get").mockResolvedValue({ data: payload });
    localStorage.setItem("user", JSON.stringify({ id: "owner", username: "owner", role: "USER" }));
    renderSpaceEntry();
    expect(await screen.findByRole("link", { name: "管理页面" })).toHaveAttribute("href", "/spaces/space-1");
    cleanup();
    localStorage.setItem("user", JSON.stringify({ id: "admin", username: "admin", role: "ADMIN" }));
    renderSpaceEntry();
    expect(await screen.findByRole("link", { name: "管理页面" })).toHaveAttribute("href", "/admin?spaceId=space-1");
    cleanup();
    localStorage.removeItem("user");
    renderSpaceEntry();
    await screen.findByRole("heading", { level: 1, name: "作品空间" });
    expect(screen.queryByRole("link", { name: "管理页面" })).not.toBeInTheDocument();
  });

  it("highlights a deadline within 30 days", async () => {
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      space: { id: "space-1", name: "作品空间", slug: "demo", expiresAt }, tags: [], deployments: [],
    } });
    renderSpaceEntry();
    expect(await screen.findByText(/空间内作品统一于/)).toHaveClass("deadline-near");
  });

  it("prefills the project name from a non-index HTML file", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      space: { id: "space-1", name: "作品空间", slug: "demo", expiresAt: "2099-01-01" },
      tags: [], deployments: [],
    } });
    const user = userEvent.setup();
    renderSpaceEntry();
    await screen.findByRole("heading", { level: 1, name: "作品空间" });
    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [new File(["html"], "Vector-Lab-Sophie.html", { type: "text/html" })] },
    });
    await user.click(screen.getByRole("button", { name: "上传到该空间" }));
    expect(screen.getByRole("textbox", { name: "项目名称" })).toHaveValue("Vector-Lab-Sophie");
  });

  it("shows public download only when the space enables it", async () => {
    const payload = {
      space: { id: "space-1", name: "作品空间", slug: "demo", expiresAt: "2099-01-01", downloadsEnabled: false },
      tags: [],
      deployments: [{ id: "d1", title: "轨道演示", publicSlug: "orbit", tagIds: [], ownerUserId: null, uploaderName: "匿名" }],
    };
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: payload });
    renderSpaceEntry();
    expect(await screen.findByRole("heading", { name: "轨道演示" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "下载轨道演示 ZIP" })).not.toBeInTheDocument();
    cleanup();
    get.mockResolvedValue({ data: { ...payload, space: { ...payload.space, downloadsEnabled: true } } });
    renderSpaceEntry();
    const download = await screen.findByRole("link", { name: "下载轨道演示 ZIP" });
    expect(download).toHaveClass("work-icon-action");
    expect(download)
      .toHaveAttribute("href", `${api.defaults.baseURL}/spaces/entry/demo/deployments/d1/download`);
    expect(screen.queryByText("无标签")).not.toBeInTheDocument();
  });

  it("filters public cards by one selected tag", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      space: { id: "space-1", name: "作品空间", slug: "demo", expiresAt: "2099-01-01" },
      tags: [
        { id: "t1", spaceId: "space-1", name: "物理", createdAt: "2026-01-01" },
        { id: "t2", spaceId: "space-1", name: "课件", createdAt: "2026-01-01" },
      ],
      deployments: [
        { id: "d1", title: "轨道演示", publicSlug: "orbit", tagIds: ["t1", "t2"], ownerUserId: null, uploaderName: "匿名" },
        { id: "d2", title: "首页", publicSlug: "home", tagIds: ["t1"], ownerUserId: null, uploaderName: "匿名" },
      ],
    } });
    const user = userEvent.setup();
    renderSpaceEntry();
    expect(await screen.findByRole("heading", { name: "轨道演示" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "物理" }));
    expect(screen.getByRole("heading", { name: "首页" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "课件" }));
    expect(screen.getByRole("button", { name: "物理" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "课件" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "轨道演示" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "首页" })).not.toBeInTheDocument();
  });

  it("uses the shared dropzone and keeps the space upload endpoint", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        space: {
          id: "space-1",
          name: "作品空间",
          slug: "demo",
          expiresAt: "2027-07-30T01:00:00.000Z",
        },
        deployments: [],
      },
    });
    vi.spyOn(api, "post").mockResolvedValue({
      data: { url: "https://drop.example/p/portfolio" },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });
    renderSpaceEntry();

    expect(await screen.findByRole("heading", { level: 1, name: "作品空间" }))
      .toBeInTheDocument();
    expect(screen.getByText(
      `空间内作品统一于 ${new Date("2027-07-30T01:00:00.000Z").toLocaleString()} 到期`,
    )).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "上传网页文件" })).toBeInTheDocument();
    expect(screen.getByLabelText("选择 HTML 文件")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("选择整个文件夹")).toHaveAttribute(
      "webkitdirectory",
      "true",
    );
    expect(screen.getByText("这个空间还没有作品")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "上传到该空间" }));
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "作品集");
    await user.click(screen.getByRole("button", { name: "确认上传" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/spaces/space-1/deployments",
        expect.any(FormData),
      );
    });
    const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
    expect(formData.get("title")).toBe("作品集");
    expect(formData.getAll("paths")).toEqual(["index.html"]);
    expect(formData.getAll("files")).toEqual([file]);
  });

  it("highlights the space name and renders works as preview cards", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        space: {
          id: "space-1",
          name: "八年级作品展",
          slug: "demo",
          expiresAt: "2027-07-30T01:00:00.000Z",
        },
        deployments: [{
          id: "d1",
          title: "我的作品",
          publicSlug: "my-work",
          ownerUserId: "u1",
          uploaderName: "member",
        }],
      },
    });

    renderSpaceEntry();

    expect(await screen.findByText("作品空间")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "八年级作品展" }))
      .toHaveClass("space-entry-title");
    expect(screen.getByRole("heading", { name: "我的作品" })).toBeInTheDocument();
    expect(screen.getByText("上传者：member")).toBeInTheDocument();
    expect(screen.getByTitle("我的作品预览")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin",
    );
    expect(screen.getByRole("link", { name: "打开我的作品" }))
      .toHaveClass("work-preview-open-overlay");
    expect(screen.queryByText("打开作品")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "隐藏我的作品" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除我的作品" })).not.toBeInTheDocument();
  });

  it("shows administrator hide and delete controls but not the owner close control", async () => {
    localStorage.setItem("token", "admin-token");
    localStorage.setItem("user", JSON.stringify({
      id: "admin-1",
      username: "fffuuu",
      role: "ADMIN",
    }));
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        space: {
          id: "space-1",
          name: "八年级作品展",
          slug: "demo",
          expiresAt: "2027-07-30T01:00:00.000Z",
        },
        deployments: [{
          id: "d1",
          title: "我的作品",
          publicSlug: "my-work",
          ownerUserId: "admin-1",
          uploaderName: "fffuuu",
        }],
      },
    });

    renderSpaceEntry();

    const card = (await screen.findByRole("heading", { name: "我的作品" }))
      .closest("article")!;
    expect(within(card).getByRole("link", { name: "打开我的作品" }))
      .toHaveClass("work-preview-open-overlay");
    expect(within(card).getByRole("button", { name: "隐藏我的作品" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "删除我的作品" })).toBeInTheDocument();
    const byline = within(card).getByText("上传者：fffuuu").parentElement;
    expect(byline).toContainElement(within(card).getByRole("button", { name: "隐藏我的作品" }));
    expect(byline).toContainElement(within(card).getByRole("button", { name: "删除我的作品" }));
    expect(within(card).queryByText("无标签")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
  });

  it("lets a signed-in uploader rename their work inside the space", async () => {
    localStorage.setItem("token", "member-token");
    localStorage.setItem("user", JSON.stringify({ id: "u1", username: "member", role: "USER" }));
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      space: { id: "space-1", name: "作品空间", slug: "demo", ownerUserId: "other", expiresAt: "2027-07-30T01:00:00.000Z" },
      deployments: [{ id: "d1", title: "旧作品", publicSlug: "work", ownerUserId: "u1", uploaderName: "member" }],
    } });
    vi.spyOn(api, "patch").mockResolvedValue({ data: { id: "d1", title: "新作品" } });
    const user = userEvent.setup();
    renderSpaceEntry();

    await user.click(await screen.findByRole("button", { name: "重命名旧作品" }));
    await user.clear(screen.getByRole("textbox", { name: "项目名称" }));
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "新作品");
    await user.click(screen.getByRole("button", { name: "保存名称" }));

    expect(api.patch).toHaveBeenCalledWith("/deployments/d1", { title: "新作品" });
    expect(await screen.findByRole("heading", { name: "新作品" })).toBeInTheDocument();
  });

  it("lets the space creator rename another uploader's work, but hides editing from visitors", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      space: { id: "space-1", name: "作品空间", slug: "demo", ownerUserId: "creator", expiresAt: "2027-07-30T01:00:00.000Z" },
      deployments: [{ id: "d1", title: "学生作品", publicSlug: "work", ownerUserId: "student", uploaderName: "student" }],
    } });
    renderSpaceEntry();
    expect(await screen.findByRole("heading", { name: "学生作品" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重命名学生作品" })).not.toBeInTheDocument();
    cleanup();

    localStorage.setItem("token", "creator-token");
    localStorage.setItem("user", JSON.stringify({ id: "creator", username: "creator", role: "USER" }));
    renderSpaceEntry();
    expect(await screen.findByRole("button", { name: "重命名学生作品" })).toBeInTheDocument();
  });

  it("removes a hidden work from the administrator space entry", async () => {
    localStorage.setItem("token", "admin-token");
    localStorage.setItem("user", JSON.stringify({
      id: "admin-1",
      username: "fffuuu",
      role: "ADMIN",
    }));
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        space: {
          id: "space-1",
          name: "作品空间",
          slug: "demo",
          expiresAt: "2027-07-30T01:00:00.000Z",
        },
        deployments: [{
          id: "d1",
          title: "待隐藏作品",
          publicSlug: "work",
          ownerUserId: null,
          uploaderName: "匿名",
        }],
      },
    });
    vi.spyOn(api, "patch").mockResolvedValue({ data: { id: "d1", visibility: "hidden" } });
    const user = userEvent.setup();

    renderSpaceEntry();
    await user.click(await screen.findByRole("button", { name: "隐藏待隐藏作品" }));

    expect(api.patch).toHaveBeenCalledWith(
      "/admin/deployments/d1",
      { visibility: "hidden" },
    );
    expect(screen.queryByRole("heading", { name: "待隐藏作品" })).not.toBeInTheDocument();
  });

  it("confirms before permanently deleting a work as administrator", async () => {
    localStorage.setItem("token", "admin-token");
    localStorage.setItem("user", JSON.stringify({
      id: "admin-1",
      username: "fffuuu",
      role: "ADMIN",
    }));
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        space: {
          id: "space-1",
          name: "作品空间",
          slug: "demo",
          expiresAt: "2027-07-30T01:00:00.000Z",
        },
        deployments: [{
          id: "d1",
          title: "待删除作品",
          publicSlug: "work",
          ownerUserId: null,
          uploaderName: "匿名",
        }],
      },
    });
    vi.spyOn(api, "delete").mockResolvedValue({ data: { message: "网页已永久删除" } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    renderSpaceEntry();
    await user.click(await screen.findByRole("button", { name: "删除待删除作品" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "此操作将永久删除该作品，无法恢复。确定继续吗？",
    );
    expect(api.delete).toHaveBeenCalledWith("/admin/deployments/d1");
    expect(screen.queryByRole("heading", { name: "待删除作品" })).not.toBeInTheDocument();
  });
});
