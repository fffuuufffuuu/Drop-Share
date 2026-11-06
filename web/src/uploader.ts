export type UploadEntry = {
  file: File;
  path: string;
  sourceFolderName?: string;
};

export function suggestProjectName(entries: UploadEntry[]): string {
  const folderName = entries[0]?.sourceFolderName;
  if (folderName && entries.every((entry) => entry.sourceFolderName === folderName)) {
    return folderName.slice(0, 80);
  }
  if (entries.length !== 1) return "";
  const filename = entries[0].file.name;
  if (!/\.html?$/i.test(filename)) return "";
  const name = filename.replace(/\.html?$/i, "");
  return name.toLowerCase() === "index" ? "" : name.slice(0, 80);
}

export function collectUploadEntries(files: FileList | null): UploadEntry[] {
  if (!files) {
    return [];
  }
  const entries = Array.from(files).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
  const root = entries[0]?.path.split("/")[0];
  if (root && entries.every((entry) => entry.path.startsWith(`${root}/`))) {
    return entries.map((entry) => ({
      ...entry,
      path: entry.path.slice(root.length + 1),
      sourceFolderName: root,
    }));
  }
  return entries;
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (!batch.length) {
      return entries;
    }
    entries.push(...batch);
  }
}

async function collectEntry(entry: FileSystemEntry, parentPath = ""): Promise<UploadEntry[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile) {
    return [{
      file: await readFileEntry(entry as FileSystemFileEntry),
      path,
    }];
  }

  const children = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
  const nested = await Promise.all(children.map((child) => collectEntry(child, path)));
  return nested.flat();
}

export async function collectDroppedEntries(dataTransfer: DataTransfer): Promise<UploadEntry[]> {
  const items = Array.from(dataTransfer.items).filter((item) => item.kind === "file");
  const supportsEntries = items.length > 0 && items.every(
    (item) => typeof item.webkitGetAsEntry === "function",
  );
  if (!supportsEntries) {
    return collectUploadEntries(dataTransfer.files);
  }

  const roots = items.map((item) => item.webkitGetAsEntry()).filter(
    (entry): entry is FileSystemEntry => entry !== null,
  );
  if (!roots.length) {
    return collectUploadEntries(dataTransfer.files);
  }

  const entries = (await Promise.all(roots.map((entry) => collectEntry(entry)))).flat();
  if (roots.length === 1 && roots[0].isDirectory) {
    const prefix = `${roots[0].name}/`;
    return entries.map((entry) => ({
      ...entry,
      path: entry.path.slice(prefix.length),
      sourceFolderName: roots[0].name,
    }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
