// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkCardGrid } from "./WorkCardGrid";
import { WorkPreviewCard } from "./WorkPreviewCard";
import { api } from "../api";
import { WorkVersionActions } from "./WorkVersionActions";

beforeEach(() => { vi.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("honors a requested work once and lets the user collapse it without immediately reopening", async () => {
  vi.spyOn(api, "get").mockResolvedValue({ data: { description: "简介", comments: [], canEdit: false, canComment: false } });
  render(<WorkCardGrid><WorkPreviewCard workId="d1" title="定位作品" publicSlug="demo" meta="" cardLink focusRequested /></WorkCardGrid>);
  const card = screen.getByRole("heading", { name: "定位作品" }).closest("article")!;
  expect(card).toHaveAttribute("data-expanded", "true");
  await userEvent.keyboard("{Escape}");
  expect(card).toHaveAttribute("data-expanded", "false");
});

it("focuses one card, keeps actions inside it, switches focus and collapses outside", async () => {
  vi.spyOn(api, "get").mockResolvedValue({ data: { description: "交互实验简介", comments: [
    { id: "c1", authorName: "同学", content: "很好用", createdAt: "2026-11-03T02:00:00Z" },
  ], canEdit: false, canComment: false } });
  render(<><WorkCardGrid>{["甲", "乙"].map(title => <WorkPreviewCard key={title}
    workId={title} title={title} publicSlug={title} cardLink meta="上传者"
    actions={<button>下载{title}</button>} />)}</WorkCardGrid><button>页面空白</button></>);
  const first = screen.getByRole("heading", { name: "甲" }).closest("article")!;
  const second = screen.getByRole("heading", { name: "乙" }).closest("article")!;
  expect(document.querySelectorAll("iframe")).toHaveLength(0);
  expect(screen.queryByRole("link", { name: "打开甲" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "展开甲" }));
  expect(first).toHaveAttribute("data-expanded", "true");
  const firstPreview = screen.getByTitle("甲预览");
  expect(document.querySelectorAll("iframe")).toHaveLength(1);
  expect(await screen.findByText("交互实验简介")).toBeInTheDocument();
  expect(screen.getByText("很好用")).toBeInTheDocument();
  const description = first.querySelector(".work-description")!;
  const controls = screen.getByRole("group", { name: "甲的作品操作" });
  const comments = first.querySelector(".work-comments")!;
  expect(description.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(controls.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(screen.queryByRole("textbox", { name: "发表评论" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "甲" })).toHaveAttribute("href", "/p/甲/");
  expect(screen.getByRole("link", { name: "打开甲的预览" })).toHaveAttribute("href", "/p/甲/");
  expect(screen.queryByText("打开作品")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "收起卡片" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "下载甲" }));
  expect(first).toHaveAttribute("data-expanded", "true");
  await userEvent.click(screen.getByRole("button", { name: "展开乙" }));
  expect(second).toHaveAttribute("data-expanded", "true");
  expect(first).toHaveAttribute("data-expanded", "false");
  expect(firstPreview).not.toBeInTheDocument();
  expect(document.querySelectorAll("iframe")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "页面空白" }));
  expect(second).toHaveAttribute("data-expanded", "false");
  expect(document.querySelectorAll("iframe")).toHaveLength(0);
});

it("keeps the focused card alive while operating its upload dialog", async () => {
  vi.spyOn(api, "get").mockResolvedValue({ data: { description: "", comments: [], canEdit: false, canComment: false } });
  render(<WorkCardGrid><WorkPreviewCard workId="d1" title="甲" publicSlug="a" cardLink meta="上传者"
    actions={<WorkVersionActions work={{ id: "d1", title: "甲", publicSlug: "a", canUpdate: true }} action="update" onChanged={() => {}} />} />
  </WorkCardGrid>);
  await userEvent.click(screen.getByRole("button", { name: "展开甲" }));
  await userEvent.click(screen.getByRole("button", { name: "更新上传甲" }));
  await userEvent.click(screen.getByRole("heading", { name: "更新上传：甲" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "甲" }).closest("article")).toHaveAttribute("data-expanded", "true");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "甲" }).closest("article")).toHaveAttribute("data-expanded", "true");
});

it("allows only one live preview across separate grids and unloads it in a background tab", async () => {
  render(<>{["甲", "乙"].map(title => <WorkCardGrid key={title}><WorkPreviewCard title={title} publicSlug={title} meta="" cardLink /></WorkCardGrid>)}</>);
  await userEvent.click(screen.getByRole("button", { name: "展开甲" }));
  await userEvent.tab();
  screen.getByRole("button", { name: "展开乙" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(document.querySelectorAll("iframe")).toHaveLength(1);
  expect(screen.queryByTitle("甲预览")).not.toBeInTheDocument();
  const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(document.querySelectorAll("iframe")).toHaveLength(0);
  hidden.mockRestore();
});

it("starts scrolling to the final layout while the expansion animation is still running", async () => {
  const animate = vi.fn(() => ({ finished: new Promise<void>(() => {}), cancel: vi.fn() }));
  const oldAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 900, width: 900, height: 420, top: 900, bottom: 1320, left: 0, right: 900, toJSON() {} });
  try {
    render(<WorkCardGrid><WorkPreviewCard title="居中" publicSlug="center" cardLink meta="" /></WorkCardGrid>);
    await userEvent.click(screen.getByRole("button", { name: "展开居中" }));
    expect(animate).toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", top: 900 - (window.innerHeight - 420) / 2 });
    await userEvent.keyboard("{Escape}");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ behavior: "instant", top: window.scrollY });
  } finally {
    if (oldAnimate) Object.defineProperty(HTMLElement.prototype, "animate", oldAnimate); else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
});

it("reveals tall cards from the top without scrolling animation when reduced motion is preferred", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 900, height: 1500 } as DOMRect);
  try {
    render(<WorkCardGrid><WorkPreviewCard title="长卡片" publicSlug="tall" cardLink meta="" /></WorkCardGrid>);
    await userEvent.click(screen.getByRole("button", { name: "展开长卡片" }));
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ behavior: "instant", top: 876 });
  } finally { vi.unstubAllGlobals(); }
});

it("keeps description editing and registered-user comments working around the action row", async () => {
  vi.spyOn(api, "get").mockResolvedValue({ data: { description: "原简介", comments: [], canEdit: true, canComment: true } });
  const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { description: "更新后的简介" } });
  const post = vi.spyOn(api, "post").mockResolvedValue({ data: { id: "c2", authorName: "Teacher", content: "课堂演示很好用", createdAt: "2026-11-04T14:00:00Z" } });
  render(<WorkCardGrid><WorkPreviewCard title="实验" publicSlug="lab" workId="work" cardLink meta="上传者" actions={<button>下载实验</button>} /></WorkCardGrid>);
  await userEvent.click(screen.getByRole("button", { name: "展开实验" }));
  await userEvent.click(await screen.findByRole("button", { name: "编辑简介" }));
  await userEvent.clear(screen.getByRole("textbox", { name: "作品简介" }));
  await userEvent.type(screen.getByRole("textbox", { name: "作品简介" }), "更新后的简介");
  await userEvent.click(screen.getByRole("button", { name: "保存简介" }));
  expect(await screen.findByText("更新后的简介")).toBeInTheDocument();
  expect(patch).toHaveBeenCalledWith("/deployments/work/description", { description: "更新后的简介" });
  await userEvent.click(screen.getByRole("button", { name: "添加评论" }));
  await userEvent.type(screen.getByRole("textbox", { name: "发表评论" }), "课堂演示很好用");
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("heading", { name: "实验" }).closest("article")).toHaveAttribute("data-expanded", "true");
  await userEvent.click(screen.getByRole("button", { name: "添加评论" }));
  expect(screen.getByRole("textbox", { name: "发表评论" })).toHaveValue("课堂演示很好用");
  await userEvent.click(screen.getByRole("button", { name: "发表评论" }));
  expect(await screen.findByText("课堂演示很好用")).toBeInTheDocument();
  expect(post).toHaveBeenCalledWith("/deployments/work/comments", { content: "课堂演示很好用" });
  expect(screen.getByRole("button", { name: "下载实验" })).toBeInTheDocument();
});
