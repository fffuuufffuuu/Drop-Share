// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkPreviewCard } from "./WorkPreviewCard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("WorkPreviewCard", () => {
  it("reveals permitted actions on hover and retracts them on mouse leave", async () => {
    render(<WorkPreviewCard title="课程作品" publicSlug="course-work" meta="member" cardLink
      titleAction={<button>重命名</button>} actions={<button>下载</button>} />);
    const card = screen.getByRole("heading", { name: "课程作品" }).closest("article")!;
    expect(screen.queryByRole("button", { name: "重命名" })).not.toBeInTheDocument();
    await userEvent.hover(card);
    expect(screen.getByRole("button", { name: "重命名" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载" })).toBeInTheDocument();
    await userEvent.unhover(card);
    expect(screen.queryByRole("button", { name: "下载" })).not.toBeInTheDocument();
  });

  it("opens from the touch toggle and closes with Escape", async () => {
    render(<WorkPreviewCard title="课程作品" publicSlug="course-work" meta="member" cardLink />);
    const toggle = screen.getByRole("button", { name: "课程作品的更多操作" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "复制课程作品的分享链接" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "复制课程作品的分享链接" })).not.toBeInTheDocument();
  });

  it("uses a static thumbnail without starting a webpage and keeps a separate visit link", async () => {
    render(
      <WorkPreviewCard
        title="课程作品"
        publicSlug="course-work"
        viewCount={1234}
        meta="上传者：member"
        actions={<button type="button">关闭</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "课程作品" })).toBeInTheDocument();
    expect(screen.getByText("上传者：member")).toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByLabelText("访问次数：1,234")).toHaveTextContent("1,234");
    expect(screen.getByRole("link", { name: "打开课程作品" })).toHaveAttribute(
      "href",
      "/p/course-work/",
    );
    await userEvent.hover(screen.getByRole("heading", { name: "课程作品" }).closest("article")!);
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("focuses a work from the whole card while leaving actions separate", async () => {
    render(
      <WorkPreviewCard
        title="课程作品"
        publicSlug="course-work"
        meta="到期时间：明天"
        actions={<button type="button">重命名</button>}
        cardLink
      />,
    );

    expect(screen.getByRole("button", { name: "展开课程作品" }))
      .toHaveClass("work-preview-open-overlay");
    expect(screen.queryByRole("link", { name: "打开课程作品" })).not.toBeInTheDocument();
    expect(screen.queryByText("打开作品")).not.toBeInTheDocument();
    await userEvent.hover(screen.getByRole("heading", { name: "课程作品" }).closest("article")!);
    expect(screen.getByRole("button", { name: "重命名" })).toBeInTheDocument();
  });

  it("copies the full public URL from a card", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<WorkPreviewCard title="课程作品" publicSlug="course-work" meta="上传者：member" cardLink />);

    await userEvent.hover(screen.getByRole("heading", { name: "课程作品" }).closest("article")!);
    await userEvent.click(screen.getByRole("button", { name: "复制课程作品的分享链接" }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/course-work/`);
    expect(await screen.findByRole("status")).toHaveTextContent("已复制");
  });
});
it("refreshes the preview after a version change while preserving the public link", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ version: "one" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ version: "two" })));
  render(<WorkPreviewCard title="课程作品" publicSlug="course-work" workId="d1" meta="member" />);
  const image = await screen.findByRole("img", { name: "课程作品预览" });
  const previous = image.getAttribute("src");
  const { act, waitFor } = await import("@testing-library/react");
  act(() => { window.dispatchEvent(new CustomEvent("work-version-changed", { detail: "d1" })); });
  await waitFor(() => expect(screen.getByRole("img", { name: "课程作品预览" })).not.toHaveAttribute("src", previous));
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.getByRole("link", { name: "打开课程作品" })).toHaveAttribute("href", "/p/course-work/");
});

it("includes the uploader with the title and view count in the floating information panel", () => {
  render(<WorkPreviewCard title="实验作品" publicSlug="lab" uploaderName="Teacher" viewCount={42} meta="到期时间：明天" cardLink />);
  const panel = screen.getByRole("heading", { name: "实验作品" }).closest(".work-preview-body")!;
  expect(panel).toHaveTextContent("上传者：Teacher");
  expect(panel.querySelector('[aria-label="访问次数：42"]')).not.toBeNull();
});
