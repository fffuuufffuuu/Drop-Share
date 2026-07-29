export type UploadEntry = {
  file: File;
  path: string;
};

export function collectUploadEntries(files: FileList | null): UploadEntry[] {
  if (!files) {
    return [];
  }
  return Array.from(files).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
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
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
