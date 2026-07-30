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

    expect(await screen.findByRole("heading", { name: "作品空间 空间入口" }))
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
});
