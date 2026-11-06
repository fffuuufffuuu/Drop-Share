import { useState } from "react";

import {
  collectDroppedEntries,
  collectUploadEntries,
  type UploadEntry,
} from "../uploader";

type UploadDropzoneProps = {
  entries: UploadEntry[];
  onEntriesChange: (entries: UploadEntry[]) => void;
  onError?: (message: string) => void;
};

export function UploadDropzone({
  entries,
  onEntriesChange,
  onError,
}: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  async function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    try {
      const droppedEntries = await collectDroppedEntries(event.dataTransfer);
      onEntriesChange(droppedEntries);
    } catch {
      onError?.("无法读取拖入的文件，请重新选择。");
    }
  }

  return (
    <section
      className={`upload-dropzone${dragging ? " upload-dropzone-active" : ""}`}
      aria-label="上传网页文件"
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="upload-dropzone-mark" aria-hidden="true">
        ↑
      </div>
      <p className="upload-dropzone-title">拖拽文件或整个文件夹到这里</p>
      <p className="upload-dropzone-subtitle">
        支持 HTML、CSS、JavaScript、图片和字体等静态资源。
      </p>
      <div className="upload-actions">
        <label className="upload-label">
          <input
            type="file"
            multiple
            accept=".html,.htm"
            onChange={(event) => {
              onEntriesChange(collectUploadEntries(event.currentTarget.files));
            }}
          />
          <span>选择 HTML 文件</span>
        </label>
        <label className="upload-label">
          <input
            type="file"
            // @ts-expect-error webkitdirectory is available in Chromium-based browsers
            webkitdirectory="true"
            multiple
            onChange={(event) => {
              onEntriesChange(collectUploadEntries(event.currentTarget.files));
            }}
          />
          <span>选择整个文件夹</span>
        </label>
      </div>
      <p className="upload-selection-status" aria-live="polite">
        已选 {entries.length} 个文件
      </p>
    </section>
  );
}
