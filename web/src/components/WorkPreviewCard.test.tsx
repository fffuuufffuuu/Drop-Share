// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkPreviewCard } from "./WorkPreviewCard";

afterEach(cleanup);

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
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute("src", "/p/course-work");
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute("loading", "lazy");
    expect(screen.getByTitle("课程作品预览")).toHaveAttribute("sandbox", "");
    expect(screen.getByRole("link", { name: "打开课程作品" })).toHaveAttribute(
      "href",
      "/p/course-work",
    );
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });
});
