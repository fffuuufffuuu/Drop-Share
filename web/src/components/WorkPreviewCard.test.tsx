// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkPreviewCard } from "./WorkPreviewCard";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("WorkPreviewCard", () => {
  it("shows a sandboxed lazy preview and a separate visit link", () => {
    render(
      <WorkPreviewCard
        title="课程作品"
        publicSlug="course-work"
        meta="上传者：member"
        actions={<button type="button">关闭</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "课程作品" })).toBeInTheDocument();
    expect(screen.getByText("上传者：member")).toBeInTheDocument();
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute("src", "/p/course-work/");
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute("loading", "lazy");
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin",
    );
    expect(screen.getByRole("link", { name: "打开课程作品" })).toHaveAttribute(
      "href",
      "/p/course-work/",
    );
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("opens a work from the whole card while leaving actions separate", () => {
    render(
      <WorkPreviewCard
        title="课程作品"
        publicSlug="course-work"
        meta="到期时间：明天"
        actions={<button type="button">重命名</button>}
        cardLink
      />,
    );

    expect(screen.getByRole("link", { name: "打开课程作品" }))
      .toHaveClass("work-preview-open-overlay");
    expect(screen.getByRole("link", { name: "打开课程作品" }))
      .toHaveAttribute("href", "/p/course-work/");
    expect(screen.queryByText("打开作品")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重命名" })).toBeInTheDocument();
  });

  it("copies the full public URL from a card", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<WorkPreviewCard title="课程作品" publicSlug="course-work" meta="上传者：member" cardLink />);

    await userEvent.click(screen.getByRole("button", { name: "复制课程作品的分享链接" }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/course-work/`);
    expect(await screen.findByRole("status")).toHaveTextContent("已复制");
  });
});
