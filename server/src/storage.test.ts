import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import { afterEach, expect, it } from "vitest";

import { config } from "./config";
import { saveDeploymentFiles } from "./storage";

const originalUploadRoot = config.uploadRoot;
const temporaryRoots: string[] = [];

afterEach(async () => {
  config.uploadRoot = originalUploadRoot;
  for (const root of temporaryRoots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      throw new Error("Unexpected test directory");
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

it("stores a file received on disk in the deployment directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "drop-share-storage-"));
  temporaryRoots.push(root);
  config.uploadRoot = root;
  const source = path.join(root, "incoming-file");
  await fs.writeFile(source, "<html>large upload</html>");

  const targetRoot = await saveDeploymentFiles("spaces/site", [{
    file: { path: source } as Express.Multer.File,
    relativePath: "index.html",
  }]);

  expect(await fs.readFile(path.join(targetRoot, "index.html"), "utf8"))
    .toBe("<html>large upload</html>");
});
