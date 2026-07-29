import { useMemo, useState } from "react";

import { api } from "../api";
import { UploadDropzone } from "../components/UploadDropzone";
import type { UploadEntry } from "../uploader";

export function UploadPage() {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [message, setMessage] = useState("拖拽 HTML 文件或文件夹，匿名部署默认 3 小时。");
  const [durationHours, setDurationHours] = useState(3);
  const [spaceId, setSpaceId] = useState("");

  const hasIndex = useMemo(
    () =>
      entries.some((entry) => entry.path.toLowerCase() === "index.html") ||
      (entries.length === 1 && entries[0].path.toLowerCase().endsWith(".html")),
    [entries],
  );

  async function upload(isAuthed: boolean) {
    if (!entries.length) {
      setMessage("请先选择文件。");
      return;
    }
    if (!hasIndex) {
      setMessage("文件夹上传必须包含 index.html。");
      return;
    }
    const formData = new FormData();
    entries.forEach((entry) => {
      formData.append("files", entry.file);
      formData.append("paths", entry.path);
    });
    formData.append("durationHours", String(durationHours));
    if (spaceId.trim()) {
      formData.append("spaceId", spaceId.trim());
    }

    try {
      const url = isAuthed ? "/deployments" : "/deployments/anonymous";
      const { data } = await api.post(url, formData);
      setMessage(`部署成功：${data.url}（到期：${new Date(data.expiresAt).toLocaleString()}）`);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "部署失败");
    }
  }

  return (
    <section className="card">
      <h2>上传并部署</h2>
      <p className="hint">支持单个 HTML 文件或整个文件夹，自动生成临时访问链接。</p>
      <UploadDropzone
        entries={entries}
        onEntriesChange={setEntries}
        onError={setMessage}
      />

      <div className="row">
        <label>
          登录用户持续时长（1-24）
          <input
            type="number"
            min={1}
            max={24}
            value={durationHours}
            onChange={(event) => setDurationHours(Number(event.target.value))}
          />
        </label>
        <label>
          可选空间 ID
          <input value={spaceId} onChange={(event) => setSpaceId(event.target.value)} />
        </label>
      </div>

      <div className="row">
        <button type="button" onClick={() => upload(false)}>
          匿名部署
        </button>
        <button type="button" onClick={() => upload(true)}>
          登录后部署
        </button>
      </div>

      <pre className="message">{message}</pre>
    </section>
  );
}
