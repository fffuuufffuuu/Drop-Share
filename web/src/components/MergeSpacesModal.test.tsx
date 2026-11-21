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

function spaceTag(name: string | RegExp) {
  return screen.getByRole("checkbox", { name });
}

function mockSuccessfulPosts(slug = "science") {
  vi.mocked(api.post).mockImplementation(async (url) => {
    if (String(url).endsWith("/availability")) return { data: { ok: true } };
    return { data: { slug } };
  });
}

async function confirmMerge(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "合并" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "确认合并" }));
}

describe("MergeSpacesModal", () => {
  it("keeps the merge title fixed in the modal header and lays tags out without an inner checkbox or scroll box", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MergeSpacesModal open admin spaces={spaces} onClose={vi.fn()} onMerged={vi.fn()} />,
    );

    const title = screen.getByRole("heading", { name: "合并空间" });
    expect(title.closest(".merge-spaces-modal-header")).not.toBeNull();
    expect(title.closest(".merge-spaces-modal-body")).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector(".merge-space-options")).not.toBeNull();

    const physics = spaceTag(/物理/);
    expect(physics.querySelector(".merge-space-name")?.tagName).toBe("STRONG");
    expect(physics.querySelector(".merge-space-name")).toHaveTextContent("物理");
    expect(physics.querySelector(".merge-space-meta")).toHaveTextContent("/physics");
    expect(physics.querySelector(".merge-space-meta")).toHaveTextContent("甲");
    expect(physics.querySelector(".merge-space-meta")?.querySelector("strong")).toBeNull();
    expect(physics).not.toHaveClass("selected");

    await user.click(physics);
    expect(physics).toHaveClass("selected");
    expect(physics).toHaveAttribute("aria-checked", "true");
  });

  it("places the same-owner hint beside the selection heading and filters tags by creator", async () => {
    const user = userEvent.setup();
    render(<MergeSpacesModal open admin spaces={spaces} onClose={vi.fn()} onMerged={vi.fn()} />);

    const heading = screen.getByText("选择要合并的空间").closest(".merge-space-options-heading");
    expect(heading).not.toBeNull();
    expect(within(heading as HTMLElement).getByText("仅能合并同一创建者的空间，新空间归该创建者。")).toHaveClass("merge-space-owner-hint");

    expect(spaceTag(/物理/)).toBeInTheDocument();
    expect(spaceTag(/历史/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "筛选" }));
    await user.click(screen.getByRole("option", { name: "乙" }));
    expect(screen.getByRole("button", { name: "筛选：乙" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /物理/ })).not.toBeInTheDocument();
    expect(spaceTag(/历史/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "筛选：乙" }));
    await user.click(screen.getByRole("option", { name: "全部" }));
    expect(spaceTag(/物理/)).toBeInTheDocument();
  });

  it("lets a personal merge still filter by the fallback creator label", async () => {
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 2).map(({ ownerUsername: _owner, ...space }) => space)}
      onClose={vi.fn()} onMerged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "筛选" }));
    await user.click(screen.getByRole("option", { name: "我" }));
    expect(spaceTag(/物理/)).toBeInTheDocument();
    expect(spaceTag(/化学/)).toBeInTheDocument();
  });

  it("limits admin choices to the same owner and submits the chosen source handling after confirmation", async () => {
    mockSuccessfulPosts("science");
    const onMerged = vi.fn();
    const user = userEvent.setup();
    render(<MergeSpacesModal open admin spaces={spaces} onClose={vi.fn()} onMerged={onMerged} />);

    await user.click(spaceTag(/物理/));
    expect(spaceTag(/化学/)).toBeEnabled();
    expect(spaceTag(/生物/)).toBeEnabled();
    expect(spaceTag(/历史/)).toBeDisabled();
    await user.click(spaceTag(/化学/));
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await user.type(screen.getByRole("textbox", { name: "网址后缀（可选）" }), "science");
    await user.selectOptions(screen.getByRole("combobox", { name: "原空间处理方式" }), "keep");
    expect(screen.queryByText("保留原空间时，该网址后缀仍归原空间使用，新空间将自动分配新的后缀。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认合并" })).not.toBeInTheDocument();
    await confirmMerge(user);

    expect(api.post).toHaveBeenCalledWith("/admin/spaces/merge/availability", {
      sourceIds: ["s1", "s2"], name: "科学", slug: "science", sourceDisposition: "keep",
    });
    expect(api.post).toHaveBeenCalledWith("/admin/spaces/merge", {
      sourceIds: ["s1", "s2"], name: "科学", slug: "science", sourceDisposition: "keep",
    });
    expect(onMerged).toHaveBeenCalledWith("science");
  });

  it("defaults to deleting the original spaces for a personal merge", async () => {
    mockSuccessfulPosts("merged123");
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 2)} onClose={vi.fn()} onMerged={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "原空间处理方式" })).toHaveValue("remove");
    await user.click(spaceTag(/物理/));
    await user.click(spaceTag(/化学/));
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await confirmMerge(user);
    expect(api.post).toHaveBeenCalledWith("/spaces/merge", {
      sourceIds: ["s1", "s2"], name: "科学", sourceDisposition: "remove",
    });
  });

  it("does not autofill the new space name or suffix from a selected space", async () => {
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 4)} onClose={vi.fn()} onMerged={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("");

    await user.click(spaceTag(/化学/));
    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("");

    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "自定义");
    await user.type(screen.getByRole("textbox", { name: "网址后缀（可选）" }), "custom");
    await user.click(spaceTag(/物理/));
    await user.click(spaceTag(/化学/));
    await user.click(spaceTag(/物理/));

    expect(screen.getByRole("textbox", { name: "新空间名称" })).toHaveValue("自定义");
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveValue("custom");
  });

  it("asks the user to confirm merging the selected number of spaces", async () => {
    mockSuccessfulPosts("physics");
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.filter((space) => space.ownerUserId === "owner-1")}
      onClose={vi.fn()} onMerged={vi.fn()} />);

    await user.click(spaceTag(/生物/));
    await user.click(spaceTag(/物理/));
    await user.click(spaceTag(/化学/));
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await user.type(screen.getByRole("textbox", { name: "网址后缀（可选）" }), "biology");
    await user.click(screen.getByRole("button", { name: "合并" }));

    expect(api.post).toHaveBeenCalledWith("/spaces/merge/availability", {
      sourceIds: ["s4", "s1", "s2"], name: "科学", slug: "biology", sourceDisposition: "remove",
    });
    expect(api.post).not.toHaveBeenCalledWith("/spaces/merge", expect.anything());
    expect(screen.getByRole("alertdialog", { name: "确定要合并这3个空间吗？" })).toBeInTheDocument();

    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/spaces/merge", expect.anything());

    await confirmMerge(user);
    expect(api.post).toHaveBeenCalledWith("/spaces/merge", {
      sourceIds: ["s4", "s1", "s2"], name: "科学", slug: "biology", sourceDisposition: "remove",
    });
  });

  it("does not open the confirm dialog when the suffix is unavailable", async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { message: "该网址后缀已被使用，请修改后再合并", errors: { slug: "该网址后缀已被使用，请修改后再合并" } } },
    });
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 2)} onClose={vi.fn()} onMerged={vi.fn()} />);

    await user.click(spaceTag(/物理/));
    await user.click(spaceTag(/化学/));
    await user.type(screen.getByRole("textbox", { name: "新空间名称" }), "科学");
    await user.type(screen.getByRole("textbox", { name: "网址后缀（可选）" }), "physics");
    await user.click(screen.getByRole("button", { name: "合并" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("该网址后缀已被使用，请修改后再合并");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "网址后缀（可选）" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/spaces/merge/availability", expect.objectContaining({ slug: "physics" }));
  });

  it("shows a name format error without opening confirmation or calling the API", async () => {
    const user = userEvent.setup();
    render(<MergeSpacesModal open spaces={spaces.slice(0, 2)} onClose={vi.fn()} onMerged={vi.fn()} />);
    await user.click(spaceTag(/物理/));
    await user.click(spaceTag(/化学/));
    await user.click(screen.getByRole("button", { name: "合并" }));
    expect(screen.getByRole("alert")).toHaveTextContent("新空间名称须为 1 至 80 个字，请修改后再合并");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
