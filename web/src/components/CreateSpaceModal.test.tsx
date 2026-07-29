// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { CreateSpaceModal } from "./CreateSpaceModal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CreateSpaceModal", () => {
  it("creates a space with plain-language fields", async () => {
    const createdSpace = {
      id: "s1",
      name: "作品空间",
      slug: "class-work",
      createdAt: "2026-07-29T01:00:00.000Z",
    };
    vi.spyOn(api, "post").mockResolvedValue({ data: createdSpace });
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateSpaceModal
        open
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    );

    expect(screen.getByRole("dialog", { name: "新建空间" })).toBeInTheDocument();
    expect(screen.queryByText(/slug/i)).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "空间名称" }), "作品空间");
    await user.type(
      screen.getByRole("textbox", { name: "自定义网址后缀" }),
      "class-work",
    );
    await user.click(screen.getByRole("button", { name: "创建空间" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/spaces", {
        name: "作品空间",
        slug: "class-work",
      });
      expect(onCreated).toHaveBeenCalledWith(createdSpace);
    });
  });

  it("shows the server error when creation fails", async () => {
    vi.spyOn(api, "post").mockRejectedValue({
      response: { data: { message: "网址后缀已存在" } },
    });
    const user = userEvent.setup();

    render(
      <CreateSpaceModal
        open
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "空间名称" }), "作品空间");
    await user.click(screen.getByRole("button", { name: "创建空间" }));

    expect(await screen.findByRole("status")).toHaveTextContent("网址后缀已存在");
  });
});
