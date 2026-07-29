import { describe, expect, it } from "vitest";

import { collectDroppedEntries, collectUploadEntries } from "./uploader";

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
  it("uses webkitRelativePath when a folder was selected", () => {
    const file = new File(["html"], "index.html", { type: "text/html" });
    Object.defineProperty(file, "webkitRelativePath", { value: "site/index.html" });

    expect(collectUploadEntries(asFileList([file]))).toEqual([
      { file, path: "site/index.html" },
    ]);
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
      { file: cssFile, path: "site/assets/app.css" },
      { file: indexFile, path: "site/index.html" },
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
