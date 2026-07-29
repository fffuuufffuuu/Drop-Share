// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UploadPage } from "./UploadPage";

afterEach(cleanup);

describe("UploadPage file choices", () => {
  it("clearly distinguishes selecting HTML files from selecting a folder", () => {
    render(<UploadPage />);

    expect(screen.getByLabelText("选择 HTML 文件")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("选择整个文件夹")).toHaveAttribute("webkitdirectory", "true");
    expect(screen.getByText("二选一即可，重新选择会替换上一次选择。")).toBeInTheDocument();
  });
});
