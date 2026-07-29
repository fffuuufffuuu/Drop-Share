// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { UploadPage } from "./UploadPage";

afterEach(() => {
  cleanup();
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
