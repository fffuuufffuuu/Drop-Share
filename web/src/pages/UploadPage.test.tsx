// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function mockSignedInGets(spaces = [activeSpace]) {
  return vi.spyOn(api, "get").mockImplementation(async (url) => {
    if (url === "/spaces") return { data: spaces } as never;
    if (url === "/deployments" || url === "/deployments/space-uploads") {
      return { data: [] } as never;
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe("UploadPage file choices", () => {
  it("prefills the project name from a selected folder", async () => {
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });
    Object.defineProperty(file, "webkitRelativePath", { value: "Physics Lab/index.html" });
    renderUploadPage();
    fireEvent.change(screen.getByLabelText("选择整个文件夹"), { target: { files: [file] } });
    await user.click(screen.getByRole("button", { name: "匿名部署" }));
    expect(screen.getByRole("textbox", { name: "项目名称" })).toHaveValue("Physics Lab");
  });

  it("uses the shared dropzone with separate file and folder fallbacks", () => {
    renderUploadPage();

    expect(screen.getByRole("region", { name: "上传网页文件" })).toBeInTheDocument();
    expect(screen.getByText("拖拽文件或整个文件夹到这里")).toBeInTheDocument();
    expect(screen.getByLabelText("选择 HTML 文件")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("选择整个文件夹")).toHaveAttribute("webkitdirectory", "true");
  });

  it("shows visitors destination choices and a slider limited to 1–3 days", async () => {
    const getSpy = vi.spyOn(api, "get");
    const user = userEvent.setup();

    renderUploadPage();

    expect(screen.queryByText("上传去向")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /个人上传/ })).toBeChecked();
    expect(screen.getByText(/可设 1–3 天/)).toBeInTheDocument();
    expect(screen.getByText(/登录后最长可保留 30 天/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /上传到空间/ })).toBeInTheDocument();
    expect(screen.getByText("登录用户专享")).toBeInTheDocument();
    expect(screen.getByText(/作品跟随空间到期（有效期 1 年，可续期延长）/)).toBeInTheDocument();

    const slider = screen.getByRole("slider", { name: "链接保留时长" });
    expect(slider).toHaveAttribute("aria-valuemin", "1");
    expect(slider).toHaveAttribute("aria-valuemax", "3");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("保留 1 天")).toBeInTheDocument();
    expect([...document.querySelectorAll(".retention-slider-scale span")].map(node => node.textContent)).toEqual(["1", "3", "7", "14", "21", "30"]);
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("登录后可延长至 30 天")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "匿名部署" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登录/注册" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText("注册登录后，即可管理自己上传的所有作品。"))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /上传到空间/ }));
    expect(screen.queryByRole("slider", { name: "链接保留时长" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "+ 新建空间" })).toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("lets a signed-in user switch from a space back to personal upload", async () => {
    signIn();
    mockSignedInGets();
    const user = userEvent.setup();

    renderUploadPage();

    const duration = screen.getByRole("slider", { name: "链接保留时长" });
    expect(duration).toHaveAttribute("aria-valuemin", "1");
    expect(duration).toHaveAttribute("aria-valuemax", "30");
    expect(duration).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/最长 30 天/)).toBeInTheDocument();
    expect(screen.queryByText("登录用户专享")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "部署" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "匿名部署" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /上传到空间/ }));
    const target = screen.getByRole("combobox", { name: "选择空间" });
    await screen.findByRole("option", { name: "作品集" });
    await user.selectOptions(target, "s1");

    expect(screen.getByText(/空间内作品跟随空间到期/)).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "链接保留时长" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /个人上传/ }));
    expect(screen.getByRole("slider", { name: "链接保留时长" }))
      .toBeInTheDocument();
  });

  it("submits durationDays for a signed-in personal upload", async () => {
    signIn();
    mockSignedInGets();
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        url: "https://drop.example/p/demo",
        expiresAt: "2026-08-29T01:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });

    renderUploadPage();
    fireEvent.keyDown(screen.getByRole("slider", { name: "链接保留时长" }), { key: "End" });
    expect(screen.getByRole("slider", { name: "链接保留时长" })).toHaveAttribute("aria-valuenow", "30");
    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "部署" }));
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "个人作品");
    await user.click(screen.getByRole("button", { name: "确认部署" }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const formData = postSpy.mock.calls[0][1] as FormData;
    expect(postSpy.mock.calls[0][0]).toBe("/deployments");
    expect(formData.get("durationDays")).toBe("30");
    expect(formData.get("spaceId")).toBeNull();
  });

  it("requires a project name before a personal deployment", async () => {
    signIn();
    mockSignedInGets([]);
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        url: "https://drop.example/p/demo",
        expiresAt: "2026-08-29T01:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });

    renderUploadPage();
    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "部署" }));

    expect(screen.getByRole("dialog", { name: "为此项目起一个名称" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "个人演示");
    await user.click(screen.getByRole("button", { name: "确认部署" }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledOnce());
    const formData = postSpy.mock.calls[0][1] as FormData;
    expect(formData.get("title")).toBe("个人演示");
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
    await user.click(screen.getByRole("radio", { name: /上传到空间/ }));
    await screen.findByRole("option", { name: "作品集" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "选择空间" }),
      "s1",
    );
    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "部署" }));
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "空间作品");
    await user.click(screen.getByRole("button", { name: "确认部署" }));

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
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "匿名作品");
    await user.click(screen.getByRole("button", { name: "确认部署" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/deployments/anonymous", expect.any(FormData));
    });
    const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
    expect(formData.get("durationDays")).toBe("1");
    expect(formData.get("spaceId")).toBeNull();
  });

  it("lets a visitor keep a file for 3 days", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        url: "https://drop.example/p/demo",
        expiresAt: "2026-08-02T01:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });

    renderUploadPage();
    const slider = screen.getByRole("slider", { name: "链接保留时长" });
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("保留 3 天")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "匿名部署" }));
    await user.type(screen.getByRole("textbox", { name: "项目名称" }), "匿名作品");
    await user.click(screen.getByRole("button", { name: "确认部署" }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    expect(postSpy.mock.calls[0][0]).toBe("/deployments/anonymous");
    expect((postSpy.mock.calls[0][1] as FormData).get("durationDays")).toBe("3");
  });

  it("prevents visitors from choosing more than 3 days while still showing the 30-day scale", () => {
    renderUploadPage();

    const slider = screen.getByRole("slider", { name: "链接保留时长" });
    const track = screen.getByTestId("retention-slider-track");
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(slider).toHaveAttribute("aria-valuemax", "3");

    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    for (let i = 0; i < 10; i += 1) {
      fireEvent.keyDown(slider, { key: "ArrowRight" });
    }
    expect(slider).toHaveAttribute("aria-valuenow", "3");

    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 8,
      width: 300,
      height: 8,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(slider, { clientX: 300, button: 0, pointerId: 1 });
    expect(slider).toHaveAttribute("aria-valuenow", "3");
  });

  it("shows an upload summary without work preview cards", async () => {
    signIn();
    const getSpy = mockSignedInGets();

    renderUploadPage();

    await screen.findByRole("link", { name: "作品集" });
    await waitFor(() => expect(screen.getByRole("region", { name: "我的上传概览" }).querySelector(".upload-overview-summary p")).toHaveTextContent("累计提交作品 0 件"));
    expect(screen.getByRole("link", { name: "我的作品" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "作品集" })).toHaveAttribute("href", "/s/portfolio");
    expect(screen.getByRole("link", { name: "进入管理" })).toHaveAttribute("href", "/spaces/s1");
    expect(getSpy).toHaveBeenCalledWith("/spaces");
    expect(getSpy).toHaveBeenCalledWith("/deployments");
    expect(getSpy).toHaveBeenCalledWith("/deployments/space-uploads");
    expect(screen.queryByRole("heading", { name: "我的个人作品" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "我上传到空间的作品" }))
      .not.toBeInTheDocument();
  });

  it("counts all submissions from the account and lists created spaces", async () => {
    signIn();
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/spaces") return { data: [
        activeSpace,
        { ...activeSpace, id: "s2", name: "旧空间", expiresAt: "2020-01-01T00:00:00.000Z" },
      ] };
      if (url === "/deployments") return { data: [
        { id: "p1", deletedAt: null },
        { id: "p2", deletedAt: "2026-01-01T00:00:00.000Z" },
      ] };
      if (url === "/deployments/space-uploads") return { data: [{ id: "w1" }] };
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderUploadPage();

    await waitFor(() => expect(screen.getByRole("region", { name: "我的上传概览" }).querySelector(".upload-overview-summary p")).toHaveTextContent("累计提交作品 3 件"));
    expect(screen.getByRole("link", { name: "作品集" })).toHaveAttribute("href", "/s/portfolio");
    expect(screen.getByRole("link", { name: "进入管理" })).toHaveAttribute("href", "/spaces/s1");
    expect(screen.getByText("旧空间")).toBeInTheDocument();
    expect(screen.getByText("已过期")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "旧空间" })).not.toBeInTheDocument();
    expect(screen.getByText("旧空间").closest("li")?.querySelector(".upload-space-manage-disabled"))
      .toHaveAttribute("aria-disabled", "true");
  });

  it("deploys a selected folder with index.html at the deployment root", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: { url: "https://drop.example/p/orbit", expiresAt: "2026-09-24T01:00:00.000Z" },
    });
    const files = ["app.js", "index.html", "README.md", "style.css"].map((name) => {
      const file = new File([name], name);
      Object.defineProperty(file, "webkitRelativePath", { value: `orbit-demo/${name}` });
      return file;
    });

    renderUploadPage();
    fireEvent.change(screen.getByLabelText("选择整个文件夹"), {
      target: { files },
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "匿名部署" }));
    await userEvent.setup().type(screen.getByRole("textbox", { name: "项目名称" }), "轨道演示");
    await userEvent.setup().click(screen.getByRole("button", { name: "确认部署" }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledOnce());
    const formData = postSpy.mock.calls[0][1] as FormData;
    expect(formData.getAll("paths")).toEqual(["app.js", "index.html", "README.md", "style.css"]);
    expect(screen.queryByText("文件夹上传必须包含 index.html。")).not.toBeInTheDocument();
  });
});
