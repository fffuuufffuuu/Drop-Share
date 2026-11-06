// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { WorkDiscussion } from "./WorkDiscussion";
const discussion = { description: "实验简介", comments: [{ id: "c1", authorName: "同学", content: "现有评论", createdAt: "2026-11-04T12:00:00Z" }], canEdit: false, canComment: true };
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); vi.spyOn(api, "get").mockResolvedValue({ data: discussion }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("edits and deletes a permitted comment, preserving edits when a save fails", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { ...discussion, comments: [{ ...discussion.comments[0], canManage: true }] } });
  const patch = vi.spyOn(api, "patch").mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce({ data: { ...discussion.comments[0], content: "修改评论", canManage: true } });
  const remove = vi.spyOn(api, "delete").mockResolvedValue({});
  render(<WorkDiscussion workId="work" />);
  await userEvent.click(await screen.findByRole("button", { name: "编辑评论" }));
  const input = screen.getByRole("textbox", { name: "编辑评论" });
  await userEvent.clear(input); await userEvent.type(input, "修改评论");
  await userEvent.click(screen.getByRole("button", { name: "保存评论" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存评论失败");
  expect(input).toHaveValue("修改评论");
  await userEvent.click(screen.getByRole("button", { name: "保存评论" }));
  expect(await screen.findByText("修改评论")).toBeInTheDocument();
  expect(patch).toHaveBeenCalledWith("/deployments/work/comments/c1", { content: "修改评论" });
  await userEvent.click(screen.getByRole("button", { name: "删除评论" }));
  expect(remove).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
  await screen.findByText("还没有评论");
  expect(remove).toHaveBeenCalledWith("/deployments/work/comments/c1");
});
it("does not show editing or deletion to readers without comment management permission", async () => {
  render(<WorkDiscussion workId="work" />); await screen.findByText("现有评论");
  expect(screen.queryByRole("button", { name: "编辑评论" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "删除评论" })).not.toBeInTheDocument();
});
it("keeps the comment visible when deletion fails and lets the user cancel", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { ...discussion, comments: [{ ...discussion.comments[0], canManage: true }] } });
  vi.spyOn(api, "delete").mockRejectedValue(new Error("failed"));
  render(<WorkDiscussion workId="work" />);
  await userEvent.click(await screen.findByRole("button", { name: "删除评论" }));
  await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("删除评论失败");
  expect(screen.getByText("现有评论")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "取消删除" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("shows existing comments immediately beneath the heading without an inline form", async () => {
  render(<WorkDiscussion workId="work" />);
  const comment = await screen.findByText("现有评论");
  expect(comment.closest(".work-comment-list")).toBe(screen.getByRole("heading", { name: "用户评论 · 1" }).nextElementSibling);
  expect(screen.queryByRole("textbox", { name: "发表评论" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "添加评论" })).toHaveAttribute("aria-expanded", "false");
});
it("shows the empty message and gives guests a login prompt without a comment form", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { ...discussion, comments: [], canComment: false } });
  const post = vi.spyOn(api, "post");
  render(<WorkDiscussion workId="guest" />);
  await screen.findByText("还没有评论");
  await userEvent.click(screen.getByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("dialog", { name: "发表评论" })).toHaveTextContent("注册并登录后可发表评论");
  expect(screen.getByRole("link", { name: "去登录" })).toHaveAttribute("href", "/login");
  expect(screen.queryByRole("textbox", { name: "发表评论" })).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
it("opens from the circle, focuses the input and preserves a draft when dismissed with Escape", async () => {
  render(<WorkDiscussion workId="draft" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  const input = screen.getByRole("textbox", { name: "发表评论" });
  expect(input).toHaveFocus();
  await userEvent.type(input, "未发布草稿");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "添加评论" })).toHaveFocus());
  await userEvent.click(screen.getByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("textbox", { name: "发表评论" })).toHaveValue("未发布草稿");
});
it("adds a successful comment to the visible list and folds back to the circle", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({ data: { id: "c2", authorName: "Teacher", content: "新评论", createdAt: "2026-11-04T13:00:00Z" } });
  render(<WorkDiscussion workId="post" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  await userEvent.type(screen.getByRole("textbox", { name: "发表评论" }), "新评论");
  await userEvent.click(screen.getByRole("button", { name: "发表评论" }));
  expect(post).toHaveBeenCalledExactlyOnceWith("/deployments/post/comments", { content: "新评论" });
  expect(await screen.findByText("新评论")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("评论已发布");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("keeps the draft and an error inside the expanded composer when posting fails", async () => {
  vi.spyOn(api, "post").mockRejectedValue({ response: { data: { message: "发送失败，请重试" } } });
  render(<WorkDiscussion workId="retry" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("button", { name: "发表评论" })).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox", { name: "发表评论" }), "保留这条评论");
  await userEvent.click(screen.getByRole("button", { name: "发表评论" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("发送失败，请重试");
  expect(screen.getByRole("alert").closest('[role="dialog"]')).not.toBeNull();
  expect(screen.getByRole("textbox", { name: "发表评论" })).toHaveValue("保留这条评论");
});

it("closes on an outside click without stealing focus and restores the draft after remount", async () => {
  const first = render(<><WorkDiscussion workId="outside" /><button>卡片其他区域</button></>);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  await userEvent.type(screen.getByRole("textbox", { name: "发表评论" }), "点击其他区域也要保留");
  await userEvent.click(screen.getByRole("button", { name: "卡片其他区域" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "卡片其他区域" })).toHaveFocus();
  first.unmount();
  render(<WorkDiscussion workId="outside" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("textbox", { name: "发表评论" })).toHaveValue("点击其他区域也要保留");
});
it("keeps cached drafts separate for different works and accounts", async () => {
  localStorage.setItem("user", JSON.stringify({ id: "user-a", username: "Teacher" }));
  let view = render(<WorkDiscussion workId="one" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  await userEvent.type(screen.getByRole("textbox", { name: "发表评论" }), "作品一的草稿");
  view.unmount();
  view = render(<WorkDiscussion workId="two" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("textbox", { name: "发表评论" })).toHaveValue("");
  view.unmount();
  localStorage.setItem("user", JSON.stringify({ id: "user-b", username: "Another" }));
  view = render(<WorkDiscussion workId="one" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("textbox", { name: "发表评论" })).toHaveValue("");
  view.unmount();
  localStorage.setItem("user", JSON.stringify({ id: "user-a", username: "Teacher" }));
  render(<WorkDiscussion workId="one" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("textbox", { name: "发表评论" })).toHaveValue("作品一的草稿");
});

it("removes the cached draft only after a successful publication", async () => {
  vi.spyOn(api, "post").mockResolvedValue({ data: { id: "sent", authorName: "Teacher", content: "发送并清除", createdAt: "2026-11-04T15:00:00Z" } });
  const first = render(<WorkDiscussion workId="clear-sent" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  await userEvent.type(screen.getByRole("textbox", { name: "发表评论" }), "发送并清除");
  expect(sessionStorage.length).toBe(1);
  await userEvent.click(screen.getByRole("button", { name: "发表评论" }));
  await screen.findByText("评论已发布");
  expect(sessionStorage.length).toBe(0);
  first.unmount();
  render(<WorkDiscussion workId="clear-sent" />);
  await userEvent.click(await screen.findByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("textbox", { name: "发表评论" })).toHaveValue("");
});
