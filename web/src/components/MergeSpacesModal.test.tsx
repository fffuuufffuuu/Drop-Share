// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { MergeSpacesModal } from "./MergeSpacesModal";

vi.mock("../api", () => ({ api: { post: vi.fn() } }));

const spaces = [
  { id: "s1", name: "物理", slug: "physics", ownerUserId: "owner-1", ownerUsername: "甲",
    createdAt: "2026-01-01", expiresAt: "2099-01-01", viewCount: 0, deploymentCount: 1, downloadsEnabled: false },
  { id: "s2", name: "化学", slug: "chemistry", ownerUserId: "owner-1", ownerUsername: "甲",
    createdAt: "2026-01-01", expiresAt: "2099-01-01", viewCount: 0, deploymentCount: 2, downloadsEnabled: false },
  { id: "s3", name: "历史", slug: "history", ownerUserId: "owner-2", ownerUsername: "乙",
    createdAt: "2026-01-01", expiresAt: "2099-01-01", viewCount: 0, deploymentCount: 3, downloadsEnabled: false },
  { id: "s4", name: "生物", slug: "biology", ownerUserId: "owner-1", ownerUsername: "甲",
    createdAt: "2026-01-01", expiresAt: "2099-01-01", viewCount: 0, deploymentCount: 4, downloadsEnabled: false },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function checkbox(name: string | RegExp) {
  return screen.getByRole("checkbox", { name });
}

describe("MergeSpacesModal", () => {
  it("limits admin choices to the same owner and submits the chosen source handling", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { slug: "science" } });
    const onMerged = vi.fn();
    const user = userEvent.setup();
    render(<MergeSpacesModal open admin spaces={spaces} onClose={vi.fn()} onMerged={onMerged} />);

    await user.click(checkbox(/物理/));
    expect(checkbox(/化学/)).toBeEnabled();
    expect(checkbox(/生物/)).toBeEnabled();
    expect(checkbox(/历史/)).toBeDisabled();
    await user.click(checkbox(/化学/));
    await user.clear(screen.getByRole("textbox", { name: "新空间名称" }));
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await user.clear(screen.getByRole("textbox", { name: "网址后缀（可选）" }));
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
    await user.click(checkbox(/物理/));
    await user.click(checkbox(/化学/));
    await user.clear(screen.getByRole("textbox", { name: "新空间名称" }));
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await user.clear(screen.getByRole("textbox", { name: "网址后缀（可选）" }));
    await user.click(screen.getByRole("button", { name: "确认合并" }));
    expect(api.post).toHaveBeenCalledWith("/spaces/merge", {
      sourceIds: ["s1", "s2"], name: "科学", sourceDisposition: "keep",
    });
  });

  it("autofills the new space name and suffix from the first selected space", async () => {
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 4)} onClose={vi.fn()} onMerged={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("");

    await user.click(checkbox(/化学/));
    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("化学");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("chemistry");

    await user.click(checkbox(/物理/));
    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("化学");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("chemistry");

    await user.click(checkbox(/化学/));
    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("物理");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("physics");
  });

  it("clears autofilled fields when every space is deselected", async () => {
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 2)} onClose={vi.fn()} onMerged={vi.fn()} />);

    await user.click(checkbox(/物理/));
    await user.clear(screen.getByRole("textbox", { name: "新空间名称" }));
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "自定义");
    await user.clear(screen.getByRole("textbox", { name: "网址后缀（可选）" }));
    await user.type(screen.getByRole("textbox", { name: "网址后缀（可选）" }), "custom");
    await user.click(checkbox(/物理/));

    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("");
  });

  it("keeps manual name and suffix edits when the first selected space changes", async () => {
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 2)} onClose={vi.fn()} onMerged={vi.fn()} />);

    await user.click(checkbox(/物理/));
    await user.clear(screen.getByRole("textbox", { name: "新空间名称" }));
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await user.clear(screen.getByRole("textbox", { name: "网址后缀（可选）" }));
    await user.type(screen.getByRole("textbox", { name: "网址后缀（可选）" }), "science");
    await user.click(checkbox(/化学/));
    await user.click(checkbox(/物理/));

    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("科学");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("science");
  });

  it("merges three selected spaces in the order they were checked", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { slug: "physics" } });
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.filter((space) => space.ownerUserId === "owner-1")}
      onClose={vi.fn()} onMerged={vi.fn()} />);

    await user.click(checkbox(/生物/));
    await user.click(checkbox(/物理/));
    await user.click(checkbox(/化学/));
    await user.selectOptions(screen.getByRole("combobox", { name: "原空间处理方式" }), "remove");
    await user.click(screen.getByRole("button", { name: "确认合并" }));

    expect(api.post).toHaveBeenCalledWith("/spaces/merge", {
      sourceIds: ["s4", "s1", "s2"], name: "生物", slug: "biology", sourceDisposition: "remove",
    });
  });
});
