// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { MergeSpacesModal } from "./MergeSpacesModal";

vi.mock("../api", () => ({ api: { post: vi.fn() } }));

const spaces = [
  { id: "s1", name: "物理", slug: "physics", ownerUserId: "owner-1", ownerUsername: "甲",
    createdAt: "2026-01-01", expiresAt: "2099-01-01", deploymentCount: 1, downloadsEnabled: false },
  { id: "s2", name: "化学", slug: "chemistry", ownerUserId: "owner-1", ownerUsername: "甲",
    createdAt: "2026-01-01", expiresAt: "2099-01-01", deploymentCount: 2, downloadsEnabled: false },
  { id: "s3", name: "历史", slug: "history", ownerUserId: "owner-2", ownerUsername: "乙",
    createdAt: "2026-01-01", expiresAt: "2099-01-01", deploymentCount: 3, downloadsEnabled: false },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MergeSpacesModal", () => {
  it("limits admin choices to the same owner and submits the chosen source handling", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { slug: "science" } });
    const onMerged = vi.fn();
    const user = userEvent.setup();
    render(<MergeSpacesModal open admin spaces={spaces} onClose={vi.fn()} onMerged={onMerged} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "第一个空间" }), "s1");
    const second = screen.getByRole("combobox", { name: "第二个空间" });
    expect(within(second).getByRole("option", { name: /化学/ })).toBeInTheDocument();
    expect(within(second).queryByRole("option", { name: /历史/ })).not.toBeInTheDocument();
    await user.selectOptions(second, "s2");
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await user.type(screen.getByRole("textbox", { name: "网址后缀（可选）" }), "science");
    await user.selectOptions(screen.getByRole("combobox", { name: "原空间处理方式" }), "remove");
    await user.click(screen.getByRole("button", { name: "确认合并" }));

    expect(api.post).toHaveBeenCalledWith("/admin/spaces/merge", {
      sourceIds: ["s1", "s2"], name: "科学", slug: "science", sourceDisposition: "remove",
    });
    expect(onMerged).toHaveBeenCalledWith("science");
  });

  it("defaults to keeping the original spaces for a personal merge", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { slug: "merged123" } });
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 2)} onClose={vi.fn()} onMerged={vi.fn()} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "第一个空间" }), "s1");
    await user.selectOptions(screen.getByRole("combobox", { name: "第二个空间" }), "s2");
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await user.click(screen.getByRole("button", { name: "确认合并" }));
    expect(api.post).toHaveBeenCalledWith("/spaces/merge", {
      sourceIds: ["s1", "s2"], name: "科学", sourceDisposition: "keep",
    });
  });
});
