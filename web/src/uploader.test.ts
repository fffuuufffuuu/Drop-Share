import { describe, expect, it } from "vitest";

import { collectDroppedEntries, collectUploadEntries, formatUploadSelectionSummary, suggestProjectName } from "./uploader";

function asFileList(files: File[]): FileList {
  return {
    ...files,
    length: files.length,
    item: (index: number) => files[index] ?? null,
  } as unknown as FileList;
}

function fileEntry(name: string, file: File): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath: `/${name}`,
    filesystem: {} as FileSystem,
    getParent: () => undefined,
    file: (success: FileCallback) => success(file),
  } as unknown as FileSystemFileEntry;
}

function directoryEntry(name: string, children: FileSystemEntry[]): FileSystemDirectoryEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${name}`,
    filesystem: {} as FileSystem,
    getParent: () => undefined,
    createReader: () => {
      let finished = false;
      return {
        readEntries: (success: FileSystemEntriesCallback) => {
          success(finished ? [] : children);
          finished = true;
        },
      } as FileSystemDirectoryReader;
    },
  } as unknown as FileSystemDirectoryEntry;
}

describe("upload entry collection", () => {
  it("removes the selected folder name while preserving nested paths", () => {
    const file = new File(["html"], "index.html", { type: "text/html" });
    const cssFile = new File(["css"], "app.css", { type: "text/css" });
    Object.defineProperty(file, "webkitRelativePath", { value: "site/index.html" });
    Object.defineProperty(cssFile, "webkitRelativePath", { value: "site/assets/app.css" });

    expect(collectUploadEntries(asFileList([file, cssFile]))).toEqual([
      { file, path: "index.html", sourceFolderName: "site" },
      { file: cssFile, path: "assets/app.css", sourceFolderName: "site" },
    ]);
  });

  it("suggests a non-index HTML filename and leaves index.html unnamed", () => {
    const html = new File(["html"], "Vector-Lab-Sophie.html", { type: "text/html" });
    const index = new File(["html"], "index.html", { type: "text/html" });
    expect(suggestProjectName([{ file: html, path: html.name }])).toBe("Vector-Lab-Sophie");
    expect(suggestProjectName([{ file: index, path: index.name }])).toBe("");
  });

  it("suggests the selected folder instead of index.html", () => {
    const file = new File(["html"], "index.html", { type: "text/html" });
    Object.defineProperty(file, "webkitRelativePath", { value: "Physics Lab/index.html" });
    expect(suggestProjectName(collectUploadEntries(asFileList([file])))).toBe("Physics Lab");
  });

  it("recursively reads a dropped directory and preserves its paths", async () => {
    const indexFile = new File(["html"], "index.html", { type: "text/html" });
    const cssFile = new File(["css"], "app.css", { type: "text/css" });
    const root = directoryEntry("site", [
      fileEntry("index.html", indexFile),
      directoryEntry("assets", [fileEntry("app.css", cssFile)]),
    ]);
    const dataTransfer = {
      items: [{
        kind: "file",
        webkitGetAsEntry: () => root,
      }],
      files: asFileList([]),
    } as unknown as DataTransfer;

    await expect(collectDroppedEntries(dataTransfer)).resolves.toEqual([
      { file: cssFile, path: "assets/app.css", sourceFolderName: "site" },
      { file: indexFile, path: "index.html", sourceFolderName: "site" },
    ]);
  });

  it("falls back to DataTransfer files when directory entries are unavailable", async () => {
    const file = new File(["html"], "index.html", { type: "text/html" });
    const dataTransfer = {
      items: [{ kind: "file" }],
      files: asFileList([file]),
    } as unknown as DataTransfer;

    await expect(collectDroppedEntries(dataTransfer)).resolves.toEqual([
      { file, path: "index.html" },
    ]);
  });
});

describe("formatUploadSelectionSummary", () => {
  it("names a single file, a folder, and multiple selections", () => {
    const html = new File(["html"], "index.html", { type: "text/html" });
    const css = new File(["css"], "app.css", { type: "text/css" });
    const folderFile = new File(["html"], "index.html", { type: "text/html" });
    Object.defineProperty(folderFile, "webkitRelativePath", { value: "Physics Lab/index.html" });
    const folderEntries = collectUploadEntries(asFileList([folderFile]));

    expect(formatUploadSelectionSummary([])).toBe("已选 0 个文件");
    expect(formatUploadSelectionSummary([{ file: html, path: "index.html" }]))
      .toBe("已选 index.html");
    expect(formatUploadSelectionSummary(folderEntries))
      .toBe("已选文件夹「Physics Lab」，共 1 个文件");
    expect(formatUploadSelectionSummary([
      { file: html, path: "index.html" },
      { file: css, path: "app.css" },
    ])).toBe("已选 index.html、app.css（共 2 个文件）");
    expect(formatUploadSelectionSummary([
      { file: new File(["a"], "a.html"), path: "a.html" },
      { file: new File(["b"], "b.html"), path: "b.html" },
      { file: new File(["c"], "c.html"), path: "c.html" },
      { file: new File(["d"], "d.html"), path: "d.html" },
    ])).toBe("已选 a.html、b.html、c.html 等共 4 个文件");
  });
});
