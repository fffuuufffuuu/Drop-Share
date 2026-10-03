import fs from "node:fs/promises";
import path from "node:path";
import type { Express } from "express";

import { config } from "./config";
import { sanitizeRelativePath } from "./utils";

type UploadItem = {
  file: Express.Multer.File;
  relativePath: string;
};

async function storeUploadedFile(file: Express.Multer.File, target: string): Promise<void> {
  if (!file.path) {
    await fs.writeFile(target, file.buffer);
    return;
  }
  try {
    await fs.rename(file.path, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.copyFile(file.path, target);
    await fs.rm(file.path, { force: true });
  }
}

export async function ensureStorageRoot(): Promise<void> {
  await fs.mkdir(config.uploadRoot, { recursive: true });
}

export async function saveDeploymentFiles(baseDir: string, items: UploadItem[]): Promise<string> {
  const deploymentRoot = path.join(config.uploadRoot, baseDir);
  await fs.mkdir(deploymentRoot, { recursive: true });

  if (items.length === 1 && items[0].relativePath.toLowerCase().endsWith(".html")) {
    const target = path.join(deploymentRoot, "index.html");
    await storeUploadedFile(items[0].file, target);
    return deploymentRoot;
  }

  let hasIndex = false;
  for (const item of items) {
    const safeRelativePath = sanitizeRelativePath(item.relativePath);
    if (safeRelativePath.toLowerCase() === "index.html") {
      hasIndex = true;
    }
    const absoluteTarget = path.join(deploymentRoot, safeRelativePath);
    await fs.mkdir(path.dirname(absoluteTarget), { recursive: true });
    await storeUploadedFile(item.file, absoluteTarget);
  }

  if (!hasIndex) {
    throw new Error("Folder upload must contain index.html");
  }

  return deploymentRoot;
}

export async function removeDeploymentFolder(absPath: string): Promise<void> {
  await fs.rm(absPath, { recursive: true, force: true });
}
