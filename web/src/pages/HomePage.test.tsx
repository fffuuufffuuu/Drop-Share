// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import App from "../App";

afterEach(cleanup);

describe("HomePage", () => {
  it("presents the final slogan, summary, and simplified feature cards", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const main = within(screen.getByRole("main"));
    const heading = main.getByRole("heading", { name: "一键部署，随时分享。" });
    expect(within(heading).getByText("一键部署，")).toHaveClass("home-title-line");
    expect(within(heading).getByText("随时分享。")).toHaveClass("home-title-line");
    expect(main.getByText(
      "上传 HTML 文件或完整网页文件夹，立即获得一个可分享的访问链接。",
    )).toBeInTheDocument();

    expect(main.getByRole("heading", { name: "一键部署" })).toHaveClass("home-feature-title");
    expect(main.getByRole("heading", { name: "立即分享" })).toHaveClass("home-feature-title");
    expect(main.getByRole("heading", { name: "统一管理" })).toHaveClass("home-feature-title");
    expect(main.queryByText("选择文件")).not.toBeInTheDocument();
    expect(main.queryByText("完成发布")).not.toBeInTheDocument();
    expect(main.queryByText("集中整理")).not.toBeInTheDocument();

    expect(main.getByText("portfolio/index.html")).toBeInTheDocument();
    expect(main.getByText("部署完成")).toBeInTheDocument();
    expect(main.getByText("drop.yaoguosir.com/p/your-page")).toBeInTheDocument();
    expect(main.getByRole("link", { name: "免费使用" })).toHaveAttribute("href", "/upload");
    expect(main.queryByText("免费试用")).not.toBeInTheDocument();
    expect(main.getByText(
      "匿名上传保留 1 天；登录后个人上传可选择 1–30 天；空间可设置 1–365 天，空间内作品跟随空间到期。",
    )).toBeInTheDocument();
  });
});
