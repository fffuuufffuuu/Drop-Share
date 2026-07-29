// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import App from "../App";

afterEach(cleanup);

describe("HomePage", () => {
  it("explains the service and links free use to the uploader", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", {
      name: "把网页变成一个随时可分享的链接",
    })).toBeInTheDocument();
    expect(main.getByRole("link", { name: "免费使用" })).toHaveAttribute("href", "/upload");
    expect(main.getByText(/匿名上传默认保留 3 小时/)).toBeInTheDocument();
    expect(main.getByText(/登录后可选择 1–24 小时/)).toBeInTheDocument();
    expect(main.queryByText("免费试用")).not.toBeInTheDocument();
  });
});
