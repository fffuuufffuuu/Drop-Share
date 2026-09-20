// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { UploadPage } from "./UploadPage";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderUploadPage(initialEntry = "/upload") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <UploadPage />
    </MemoryRouter>,
  );
}

function signIn() {
  localStorage.setItem("token", "token");
  localStorage.setItem("user", JSON.stringify({
    id: "u2",
    username: "member",
    role: "USER",
  }));
}

const activeSpace = {
  id: "s1",
  name: "作品集",
  slug: "portfolio",
  createdAt: "2026-07-29T01:00:00.000Z",
  expiresAt: "2027-07-30T01:00:00.000Z",
  deploymentCount: 2,
};

function mockSignedInGets(
  spaces = [activeSpace],
  deployments: unknown[] = [],
  spaceDeployments: unknown[] = [],
) {
  return vi.spyOn(api, "get").mockImplementation(async (url) => {
    if (url === "/spaces") return { data: spaces } as never;
    if (url === "/deployments") return { data: deployments } as never;
    if (url === "/deployments/space-uploads") return { data: spaceDeployments } as never;
    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe("UploadPage file choices", () => {
  it("uses the shared dropzone with separate file and folder fallbacks", () => {
    renderUploadPage();

    expect(screen.getByRole("region", { name: "上传网页文件" })).toBeInTheDocument();
    expect(screen.getByText("拖拽文件或整个文件夹到这里")).toBeInTheDocument();
    expect(screen.getByLabelText("选择 HTML 文件")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("选择整个文件夹")).toHaveAttribute("webkitdirectory", "true");
  });

  it("shows visitors a fixed one-day term and registration action", () => {
    const getSpy = vi.spyOn(api, "get");

    renderUploadPage();

    expect(screen.getByText("匿名上传固定保留 1 天")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "链接保留时长（天）" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "匿名部署" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登录/注册" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("option", { name: "仅个人上传（不加入空间）" }))
      .toBeInTheDocument();
    expect(screen.getByRole("option", { name: "+ 新建空间" })).toBeInTheDocument();
    expect(screen.getByText("注册登录后，即可管理自己上传的所有作品。"))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登录/注册，管理作品" }))
      .toHaveAttribute("href", "/login");
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("lets a signed-in user switch from a space back to personal upload", async () => {
    signIn();
    mockSignedInGets();
    const user = userEvent.setup();

    renderUploadPage();

    const duration = screen.getByRole("spinbutton", { name: "链接保留时长（天）" });
    expect(duration).toHaveAttribute("min", "1");
    expect(duration).toHaveAttribute("max", "30");
    expect(screen.getByText("登录用户最长可保留 30 天")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "部署" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "匿名部署" })).not.toBeInTheDocument();

    const target = screen.getByRole("combobox", { name: "上传到空间" });
    await screen.findByRole("option", { name: "作品集" });
    await user.selectOptions(target, "s1");

    expect(screen.getByText(/空间内作品跟随空间到期/)).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "链接保留时长（天）" }))
      .not.toBeInTheDocument();

    await user.selectOptions(target, "");
    expect(target).toHaveValue("");
    expect(screen.getByRole("spinbutton", { name: "链接保留时长（天）" }))
      .toBeInTheDocument();
  });

  it("submits durationDays for a signed-in personal upload", async () => {
    signIn();
    const getSpy = mockSignedInGets();
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        url: "https://drop.example/p/demo",
        expiresAt: "2026-08-29T01:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });

    renderUploadPage();
    fireEvent.change(screen.getByRole("spinbutton", { name: "链接保留时长（天）" }), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "部署" }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const formData = postSpy.mock.calls[0][1] as FormData;
    expect(postSpy.mock.calls[0][0]).toBe("/deployments");
    expect(formData.get("durationDays")).toBe("30");
    expect(formData.get("spaceId")).toBeNull();
    await waitFor(() => {
      expect(getSpy.mock.calls.filter(([url]) => url === "/deployments")).toHaveLength(2);
    });
  });

  it("submits a selected space without a personal duration", async () => {
    signIn();
    mockSignedInGets();
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        url: "https://drop.example/p/demo",
        expiresAt: activeSpace.expiresAt,
      },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });

    renderUploadPage();
    await screen.findByRole("option", { name: "作品集" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "上传到空间" }),
      "s1",
    );
    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "部署" }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const formData = postSpy.mock.calls[0][1] as FormData;
    expect(formData.get("spaceId")).toBe("s1");
    expect(formData.get("durationDays")).toBeNull();
  });

  it("opens the create-space modal from a continued registration", async () => {
    signIn();
    mockSignedInGets([]);

    renderUploadPage("/upload?createSpace=1");

    expect(await screen.findByRole("dialog", { name: "新建空间" })).toBeInTheDocument();
  });

  it("keeps anonymous deployment on its existing endpoint", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: {
        url: "https://drop.example/p/demo",
        expiresAt: "2026-07-31T01:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });

    renderUploadPage();
    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "匿名部署" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/deployments/anonymous", expect.any(FormData));
    });
  });

  it("shows only accessible personal works as preview cards", async () => {
    signIn();
    mockSignedInGets([activeSpace], [
      {
        id: "active",
        title: "有效作品",
        publicSlug: "active-work",
        visibility: "visible",
        createdAt: "2026-07-29T01:00:00.000Z",
        expiresAt: "2099-07-30T01:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "expired",
        title: "过期作品",
        publicSlug: "expired-work",
        visibility: "visible",
        createdAt: "2020-01-01T00:00:00.000Z",
        expiresAt: "2020-01-02T00:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "deleted",
        title: "删除作品",
        publicSlug: "deleted-work",
        visibility: "visible",
        createdAt: "2026-07-29T01:00:00.000Z",
        expiresAt: "2099-07-30T01:00:00.000Z",
        deletedAt: "2026-07-29T02:00:00.000Z",
      },
    ]);

    renderUploadPage();

    expect(await screen.findByRole("heading", { name: "有效作品" })).toBeInTheDocument();
    expect(screen.getByText(/到期时间：/)).toBeInTheDocument();
    expect(screen.getByTitle("有效作品预览")).toBeInTheDocument();
    expect(screen.queryByText("过期作品")).not.toBeInTheDocument();
    expect(screen.queryByText("删除作品")).not.toBeInTheDocument();
  });

  it("shows personal and space uploads in separate columns with a space link", async () => {
    signIn();
    mockSignedInGets(
      [activeSpace],
      [{
        id: "personal",
        title: "个人主页",
        publicSlug: "personal-home",
        visibility: "visible",
        createdAt: "2026-07-29T01:00:00.000Z",
        expiresAt: "2099-07-30T01:00:00.000Z",
        deletedAt: null,
      }],
      [{
        id: "space-work",
        title: "空间作品",
        publicSlug: "space-work",
        visibility: "visible",
        createdAt: "2026-07-30T01:00:00.000Z",
        expiresAt: "2099-07-30T01:00:00.000Z",
        deletedAt: null,
        space: {
          id: "s1",
          name: "作品集",
          slug: "portfolio",
        },
      }],
    );

    renderUploadPage();

    const personalColumn = await screen.findByRole("region", { name: "我的个人作品" });
    const spaceColumn = screen.getByRole("region", { name: "我上传到空间的作品" });
    expect(within(personalColumn).getByRole("heading", { name: "个人主页" }))
      .toBeInTheDocument();
    expect(within(spaceColumn).getByRole("heading", { name: "空间作品" }))
      .toBeInTheDocument();
    expect(within(spaceColumn).getByRole("link", { name: "作品集" }))
      .toHaveAttribute("href", "/s/portfolio");
    expect(within(spaceColumn).getByText(/到期时间：/)).toBeInTheDocument();
  });
});
