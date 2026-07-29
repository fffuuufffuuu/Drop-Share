import type { Archiver } from "archiver";
import { stat } from "node:fs/promises";
import path from "node:path";

export class MissingDeploymentFolderError extends Error {
  constructor() {
    super("源文件已不存在");
  }
}

export function safeArchiveName(value: string, fallback: string): string {
  const basename = path.basename(value.replaceAll("\\", "/"));
  const sanitized = basename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "");
  return sanitized || fallback;
}

export function uniqueArchiveFolders(titles: string[]): string[] {
  const used = new Set<string>();

  return titles.map((title) => {
    const base = safeArchiveName(title, "site");
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

export async function appendDeploymentFolder(
  archive: Archiver,
  rootPath: string,
  prefix: string | false = false,
): Promise<void> {
  try {
    const info = await stat(rootPath);
    if (!info.isDirectory()) {
      throw new MissingDeploymentFolderError();
    }
  } catch (error) {
    if (error instanceof MissingDeploymentFolderError) {
      throw error;
    }
    throw new MissingDeploymentFolderError();
  }

  archive.directory(rootPath, prefix);
}

export function archiveDisposition(value: string, fallback: string): string {
  const filename = `${safeArchiveName(value, fallback)}.zip`;
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
