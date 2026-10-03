// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "../api";
import { SpaceTagControls, TagFilter } from "./SpaceTagControls";

const tags = [
  { id: "t1", spaceId: "s1", name: "物理", createdAt: "2026-01-01" },
  { id: "t2", spaceId: "s1", name: "课件", createdAt: "2026-01-01" },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("selects only one filter tag at a time", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<TagFilter tags={tags} selectedId={null} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "物理" }));
  expect(onChange).toHaveBeenCalledWith("t1");
  rerender(<TagFilter tags={tags} selectedId="t1" onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "课件" }));
  expect(onChange).toHaveBeenLastCalledWith("t2");
  rerender(<TagFilter tags={tags} selectedId="t2" onChange={onChange} />);
  expect(screen.getByRole("button", { name: "物理" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "课件" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "全部作品" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

it("adds multiple tags for selected works in the admin console", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ data: { count: 1 } });
  const refresh = vi.fn().mockResolvedValue(undefined);
  const clear = vi.fn();
  render(<SpaceTagControls admin spaceId="s1" tags={tags}
    selectedIds={["d1"]} activeTagId={null} onActiveTagChange={vi.fn()}
    onSelectionClear={clear} onRefresh={refresh} />);

  await userEvent.click(screen.getByRole("checkbox", { name: "物理" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "课件" }));
  await userEvent.click(screen.getByRole("button", { name: "为选中作品添加标签" }));

  expect(post).toHaveBeenCalledWith("/admin/spaces/s1/deployments/bulk", {
    action: "addTags", ids: ["d1"], tagIds: ["t1", "t2"],
  });
  expect(clear).toHaveBeenCalled();
  expect(refresh).toHaveBeenCalled();
});

it("lets the space owner create tags and tag multiple selected works", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(<SpaceTagControls manageTags spaceId="s1" tags={tags}
    selectedIds={["d1", "d2"]} activeTagId={null} onActiveTagChange={vi.fn()}
    onSelectionClear={vi.fn()} onRefresh={refresh} />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("新标签名称"), "实验");
  await user.click(screen.getByRole("button", { name: "添加标签" }));
  expect(post).toHaveBeenCalledWith("/spaces/s1/tags", { name: "实验" });
  await user.click(screen.getByRole("checkbox", { name: "物理" }));
  await user.click(screen.getByRole("button", { name: "为选中作品添加标签" }));
  expect(post).toHaveBeenCalledWith("/spaces/s1/deployments/bulk", {
    action: "addTags", ids: ["d1", "d2"], tagIds: ["t1"],
  });
});
