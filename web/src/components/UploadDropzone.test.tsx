// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { collectDroppedEntries } from "../uploader";
import { UploadDropzone } from "./UploadDropzone";

vi.mock("../uploader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../uploader")>();
  return {
    ...actual,
    collectDroppedEntries: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UploadDropzone", () => {
  it("presents one drop area with file and folder fallbacks", () => {
    render(<UploadDropzone entries={[]} onEntriesChange={vi.fn()} />);

    expect(screen.getByText("拖拽文件或整个文件夹到这里")).toBeInTheDocument();
    expect(screen.getByLabelText("选择 HTML 文件")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("选择整个文件夹")).toHaveAttribute(
      "webkitdirectory",
      "true",
    );
    expect(screen.getByText("已选 0 个文件")).toHaveAttribute("aria-live", "polite");
  });

  it("sends the newly selected files as a replacement list", () => {
    const onEntriesChange = vi.fn();
    const file = new File(["html"], "index.html", { type: "text/html" });
    render(<UploadDropzone entries={[]} onEntriesChange={onEntriesChange} />);

    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: { files: [file] },
    });

    expect(onEntriesChange).toHaveBeenCalledWith([{ file, path: "index.html" }]);
  });

  it("highlights drag state and replaces entries with the dropped list", async () => {
    const oldFile = new File(["old"], "old.html", { type: "text/html" });
    const newFile = new File(["new"], "index.html", { type: "text/html" });
    const onEntriesChange = vi.fn();
    vi.mocked(collectDroppedEntries).mockResolvedValue([
      { file: newFile, path: "site/index.html" },
    ]);
    render(
      <UploadDropzone
        entries={[{ file: oldFile, path: "old.html" }]}
        onEntriesChange={onEntriesChange}
      />,
    );
    const region = screen.getByRole("region", { name: "上传网页文件" });

    fireEvent.dragOver(region);
    expect(region).toHaveClass("upload-dropzone-active");
    fireEvent.dragLeave(region);
    expect(region).not.toHaveClass("upload-dropzone-active");
    fireEvent.drop(region, { dataTransfer: { items: [], files: [] } });

    await waitFor(() => {
      expect(onEntriesChange).toHaveBeenCalledWith([
        { file: newFile, path: "site/index.html" },
      ]);
    });
  });

  it("reports unreadable dropped content without replacing entries", async () => {
    const onEntriesChange = vi.fn();
    const onError = vi.fn();
    vi.mocked(collectDroppedEntries).mockRejectedValue(new Error("read failed"));
    render(
      <UploadDropzone
        entries={[]}
        onEntriesChange={onEntriesChange}
        onError={onError}
      />,
    );

    fireEvent.drop(screen.getByRole("region", { name: "上传网页文件" }), {
      dataTransfer: { items: [], files: [] },
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("无法读取拖入的文件，请重新选择。");
    });
    expect(onEntriesChange).not.toHaveBeenCalled();
  });
});
