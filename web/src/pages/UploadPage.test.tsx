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

describe("UploadPage file choices", () => {
  it("uses the shared dropzone with separate file and folder fallbacks", () => {
    renderUploadPage();

    expect(screen.getByRole("region", { name: "上传网页文件" })).toBeInTheDocument();
    expect(screen.getByText("拖拽文件或整个文件夹到这里")).toBeInTheDocument();
    expect(screen.getByLabelText("选择 HTML 文件")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("选择整个文件夹")).toHaveAttribute("webkitdirectory", "true");
  });

  it("limits visitors to three hours without loading private spaces", () => {
    const getSpy = vi.spyOn(api, "get");
    renderUploadPage();

    const duration = screen.getByRole("spinbutton", { name: "链接保留时长" });
    expect(duration).toHaveAttribute("min", "1");
    expect(duration).toHaveAttribute("max", "3");
    expect(screen.getByText("未登录用户仅限 3 小时")).toHaveClass(
      "retention-note--visitor",
    );

    fireEvent.change(duration, { target: { value: "8" } });
    expect(duration).toHaveValue(3);
    expect(screen.getByRole("combobox", { name: "上传到空间" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "+ 新建空间" })).toBeInTheDocument();
    expect(screen.queryByText("拖拽 HTML 文件或文件夹，匿名部署默认 3 小时。")).not.toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("loads the signed-in user's spaces and submits the selected space", async () => {
    localStorage.setItem("token", "token");
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));
    vi.spyOn(api, "get").mockResolvedValue({
      data: [{ id: "s1", name: "作品集", slug: "portfolio", createdAt: "2026-07-29" }],
    });
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        url: "https://drop.example/p/demo",
        expiresAt: "2026-07-29T12:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });

    renderUploadPage();

    const duration = screen.getByRole("spinbutton", { name: "链接保留时长" });
    expect(duration).toHaveAttribute("max", "24");
    expect(screen.getByText("登录用户最长可保留 24 小时")).toBeInTheDocument();
    await screen.findByRole("option", { name: "作品集" });
    await user.selectOptions(screen.getByRole("combobox", { name: "上传到空间" }), "s1");
    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: "登录后部署" }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const formData = postSpy.mock.calls[0][1] as FormData;
    expect(postSpy.mock.calls[0][0]).toBe("/deployments");
    expect(formData.get("spaceId")).toBe("s1");
  });

  it("opens the create-space modal from a continued registration", async () => {
    localStorage.setItem("token", "token");
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });

    renderUploadPage("/upload?createSpace=1");

    expect(await screen.findByRole("dialog", { name: "新建空间" })).toBeInTheDocument();
  });

  it.each([
    ["匿名部署", "/deployments/anonymous"],
    ["登录后部署", "/deployments"],
  ])("keeps %s on its existing endpoint", async (buttonName, endpoint) => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: {
        url: "https://drop.example/p/demo",
        expiresAt: "2026-07-29T12:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const file = new File(["html"], "index.html", { type: "text/html" });
    renderUploadPage();

    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: buttonName }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(endpoint, expect.any(FormData));
    });
  });
});
