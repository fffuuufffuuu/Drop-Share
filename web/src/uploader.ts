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
