// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByTitle("我的作品预览")).toHaveAttribute("sandbox", "");
  });
});
