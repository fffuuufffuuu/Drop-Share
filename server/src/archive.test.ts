import AdmZip from "adm-zip";
import archiver from "archiver";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appendDeploymentFolder, safeArchiveName, uniqueArchiveFolders } from "./archive";

const temporaryRoots: string[] = [];

async function createDeploymentRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "drop-share-archive-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "index.html"), "<h1>首页</h1>");
  await writeFile(path.join(root, "assets", "app.js"), "console.log('ok')");
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("archive helpers", () => {
  it("sanitizes unsafe archive names and keeps Chinese titles", () => {
    expect(safeArchiveName("../../bad:name", "site")).toBe("bad-name");
    expect(safeArchiveName("  ", "site")).toBe("site");
    expect(safeArchiveName("作品", "site")).toBe("作品");
  });

  it("creates unique folder names for duplicate deployment titles", () => {
    expect(uniqueArchiveFolders(["作品", "作品", "作品-2"])).toEqual([
      "作品",
      "作品-2",
      "作品-2-2",
    ]);
  });

  it("appends an existing deployment directory with its nested paths intact", async () => {
    const root = await createDeploymentRoot();
    const archive = archiver("zip");
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<void>((resolve, reject) => {
      output.on("finish", resolve);
      output.on("error", reject);
    });
    archive.pipe(output);

    await appendDeploymentFolder(archive, root, "作品");
    await archive.finalize();
    await finished;

    const entries = new AdmZip(Buffer.concat(chunks)).getEntries().map((entry) => entry.entryName);
    expect(entries).toContain("作品/index.html");
    expect(entries).toContain("作品/assets/app.js");
  });

  it("rejects a missing deployment directory", async () => {
    const missing = path.join(tmpdir(), `drop-share-missing-${Date.now()}`);

    await expect(appendDeploymentFolder({ directory: vi.fn() } as never, missing))
      .rejects.toThrow("源文件已不存在");
  });
});
