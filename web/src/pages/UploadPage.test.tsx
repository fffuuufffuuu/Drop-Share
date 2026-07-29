// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { UploadPage } from "./UploadPage";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("UploadPage file choices", () => {
  it("uses the shared dropzone with separate file and folder fallbacks", () => {
    render(<UploadPage />);

    expect(screen.getByRole("region", { name: "上传网页文件" })).toBeInTheDocument();
    expect(screen.getByText("拖拽文件或整个文件夹到这里")).toBeInTheDocument();
    expect(screen.getByLabelText("选择 HTML 文件")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("选择整个文件夹")).toHaveAttribute("webkitdirectory", "true");
  });

  it("limits visitors to three hours and labels the space field", () => {
    render(<UploadPage />);

    const duration = screen.getByRole("spinbutton", { name: "链接保留时长" });
    expect(duration).toHaveAttribute("min", "1");
    expect(duration).toHaveAttribute("max", "3");
    expect(screen.getByText("未登录用户仅限 3 小时")).toHaveClass(
      "retention-note--visitor",
    );

    fireEvent.change(duration, { target: { value: "8" } });
    expect(duration).toHaveValue(3);

    expect(screen.getByRole("textbox", { name: "上传到空间" })).toHaveAttribute(
      "placeholder",
      "空间ID",
    );
  });

  it("allows signed-in users up to twenty-four hours", () => {
    localStorage.setItem("user", JSON.stringify({
      id: "u2",
      username: "member",
      role: "USER",
    }));

    render(<UploadPage />);

    const duration = screen.getByRole("spinbutton", { name: "链接保留时长" });
    expect(duration).toHaveAttribute("max", "24");
    expect(screen.getByText("登录用户最长可保留 24 小时")).toBeInTheDocument();

    fireEvent.change(duration, { target: { value: "30" } });
    expect(duration).toHaveValue(24);
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
    render(<UploadPage />);

    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole("button", { name: buttonName }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(endpoint, expect.any(FormData));
    });
  });
});
