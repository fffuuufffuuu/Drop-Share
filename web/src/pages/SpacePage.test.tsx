// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { SpacePage } from "./SpacePage";

beforeEach(() => {
  localStorage.setItem("token", "user-token");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("SpacePage", () => {
  it("keeps single-tag filtering with the works table", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      id: "s1", name: "作品空间", slug: "portfolio", expiresAt: "2099-01-01",
      tags: [
        { id: "t1", name: "物理", spaceId: "s1", createdAt: "2026-01-01" },
        { id: "t2", name: "课件", spaceId: "s1", createdAt: "2026-01-01" },
      ],
      deployments: [
        { id: "d1", title: "物理作品", publicSlug: "physics", visibility: "visible",
          createdAt: "2026-01-01", expiresAt: "2099-01-01", uploaderName: "member", tagIds: ["t1"] },
        { id: "d2", title: "课件作品", publicSlug: "slides", visibility: "visible",
          createdAt: "2026-01-01", expiresAt: "2099-01-01", uploaderName: "member", tagIds: ["t2"] },
      ],
    } });
    render(<MemoryRouter initialEntries={["/spaces/s1"]}>
      <Routes><Route path="/spaces/:spaceId" element={<SpacePage />} /></Routes>
    </MemoryRouter>);

    const panel = await screen.findByRole("region", { name: "空间作品列表" });
    expect(within(panel).getByRole("table")).toBeInTheDocument();
    const filter = within(panel).getByLabelText("按标签筛选");
    const user = userEvent.setup();
    await user.click(within(filter).getByRole("button", { name: "物理" }));
    expect(within(panel).getByRole("link", { name: "物理作品" })).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: "课件作品" })).not.toBeInTheDocument();
    await user.click(within(filter).getByRole("button", { name: "课件" }));
    expect(within(panel).queryByRole("link", { name: "物理作品" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "课件作品" })).toBeInTheDocument();
  });

  it("lets the creator enable public downloads", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      id: "s1", name: "作品空间", slug: "portfolio",
      expiresAt: "2099-01-01", downloadsEnabled: false, tags: [], deployments: [],
    } });
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { downloadsEnabled: true } });
    render(<MemoryRouter initialEntries={["/spaces/s1"]}>
      <Routes><Route path="/spaces/:spaceId" element={<SpacePage />} /></Routes>
    </MemoryRouter>);
    const toggle = await screen.findByRole("switch", { name: "允许访客下载空间内的作品" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("批量上传到空间").compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.setup().click(toggle);
    expect(patch).toHaveBeenCalledWith("/spaces/s1/downloads", { downloadsEnabled: true });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("访客下载已开放")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加标签" })).toBeInTheDocument();
  });

  it("rejects a batch above the 2000 MB total before sending it", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      id: "s1", name: "作品空间", slug: "portfolio",
      expiresAt: "2027-07-30T01:00:00.000Z", deployments: [],
    } });
    const postSpy = vi.spyOn(api, "post");
    render(<MemoryRouter initialEntries={["/spaces/s1"]}>
      <Routes><Route path="/spaces/:spaceId" element={<SpacePage />} /></Routes>
    </MemoryRouter>);
    const picker = await screen.findByLabelText("选择整个文件夹");
    const file = new File(["html"], "index.html", { type: "text/html" });
    Object.defineProperty(file, "webkitRelativePath", { value: "large/index.html" });
    Object.defineProperty(file, "size", { value: 2000 * 1024 * 1024 + 1 });
    fireEvent.change(picker, { target: { files: [file] } });
    await userEvent.setup().click(screen.getByRole("button", { name: "批量上传到空间" }));

    expect(postSpy).not.toHaveBeenCalled();
    expect(screen.getByText("单次批量上传的文件总大小不能超过 2000 MB"))
      .toBeInTheDocument();
  });

  it("keeps the selected folder path when uploading a site", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      id: "s1", name: "作品空间", slug: "portfolio",
      expiresAt: "2027-07-30T01:00:00.000Z", deployments: [],
    } });
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        count: 1,
        deployments: [{ title: "orbit-demo" }],
        failures: [{ title: "缺页", message: "没有找到 HTML 文件" }],
      },
    });
    render(<MemoryRouter initialEntries={["/spaces/s1"]}>
      <Routes><Route path="/spaces/:spaceId" element={<SpacePage />} /></Routes>
    </MemoryRouter>);
    const picker = await screen.findByLabelText("选择整个文件夹");
    const file = new File(["<html></html>"], "index.html", { type: "text/html" });
    Object.defineProperty(file, "webkitRelativePath", { value: "orbit-demo/index.html" });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(screen.getByText(/已选择 1 个文件/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "批量上传到空间" }));
    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const body = postSpy.mock.calls[0][1] as FormData;
    expect(body.getAll("paths")).toEqual(["orbit-demo/index.html"]);
    const dialog = await screen.findByRole("dialog", { name: "批量上传结果" });
    expect(within(dialog).getByText("orbit-demo")).toBeInTheDocument();
    expect(within(dialog).getByText("上传成功")).toBeInTheDocument();
    expect(within(dialog).getByText("缺页")).toBeInTheDocument();
    expect(within(dialog).getByText("上传失败：没有找到 HTML 文件")).toBeInTheDocument();
    expect(screen.getByText(/以文件夹名命名/)).toBeInTheDocument();
    expect(screen.getByText(/唯一的 HTML 文件作为主页/)).toBeInTheDocument();
  });

  it("shows one space deadline without project-level deadlines", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        id: "s1",
        name: "作品空间",
        slug: "portfolio",
        expiresAt: "2027-07-30T01:00:00.000Z",
        deployments: [{
          id: "d1",
          title: "作品一",
          publicSlug: "work-one",
          visibility: "visible",
          createdAt: "2026-07-30T01:00:00.000Z",
          expiresAt: "2020-01-01T00:00:00.000Z",
          uploaderName: "member",
        }, {
          id: "d2",
          title: "匿名作品",
          publicSlug: "anonymous-work",
          visibility: "hidden",
          createdAt: "2026-07-30T02:00:00.000Z",
          expiresAt: "2020-01-01T00:00:00.000Z",
          uploaderName: "匿名",
        }],
      },
    });

    render(
      <MemoryRouter initialEntries={["/spaces/s1"]}>
        <Routes>
          <Route path="/spaces/:spaceId" element={<SpacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(
      `空间内作品统一于 ${new Date("2027-07-30T01:00:00.000Z").toLocaleString()} 到期`,
    )).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "作品空间" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "作品空间" })).toHaveAttribute("href", "/s/portfolio");
    expect(screen.getByRole("link", { name: "作品一" })).toHaveAttribute("href", "/p/work-one/");
    expect(screen.getByRole("columnheader", { name: "上传者" })).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
    expect(screen.getByText("匿名")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "匿名作品" })).not.toBeInTheDocument();
    const workRow = screen.getByText("作品一").closest("tr")!;
    expect(within(workRow).getByRole("button", { name: "显示/隐藏" }).parentElement)
      .toHaveClass("space-deployment-actions");
    expect(screen.queryByRole("columnheader", { name: "到期" })).not.toBeInTheDocument();
  });

  it("renames a project from space project management", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({
      data: {
        id: "s1",
        name: "作品空间",
        slug: "portfolio",
        expiresAt: "2027-07-30T01:00:00.000Z",
        deployments: [{
          id: "d1",
          title: "旧项目名",
          publicSlug: "work-one",
          visibility: "visible",
          createdAt: "2026-07-30T01:00:00.000Z",
          expiresAt: "2027-07-30T01:00:00.000Z",
          uploaderName: "member",
        }],
      },
    });
    const patchSpy = vi.spyOn(api, "patch").mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/spaces/s1"]}>
        <Routes>
          <Route path="/spaces/:spaceId" element={<SpacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const row = await screen.findByText("旧项目名").then((node) => node.closest("tr")!);
    await user.click(within(row).getByRole("button", { name: "重命名旧项目名" }));
    await user.clear(screen.getByRole("textbox", { name: "项目名称" }));
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "新的项目名");
    await user.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith(
      "/deployments/d1",
      { title: "新的项目名" },
    ));
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it("lets the space creator change the space name", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {
      id: "s1", name: "作品空间", slug: "portfolio",
      expiresAt: "2027-07-30T01:00:00.000Z", deployments: [],
    } });
    const patchSpy = vi.spyOn(api, "patch").mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/spaces/s1"]}>
        <Routes><Route path="/spaces/:spaceId" element={<SpacePage />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "修改空间名称" }));
    await user.clear(screen.getByRole("textbox", { name: "空间名称" }));
    await user.type(screen.getByRole("textbox", { name: "空间名称" }), "新空间");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(patchSpy).toHaveBeenCalledWith("/spaces/s1", { name: "新空间" });
    expect(await screen.findByText("新空间")).toBeInTheDocument();
  });
});
