import { useMemo, useState } from "react";

import { api } from "../api";
import { getCurrentUser } from "../auth";
import { UploadDropzone } from "../components/UploadDropzone";
import type { UploadEntry } from "../uploader";

export function UploadPage() {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [message, setMessage] = useState("拖拽 HTML 文件或文件夹，匿名部署默认 3 小时。");
  const [durationHours, setDurationHours] = useState(3);
  const [spaceId, setSpaceId] = useState("");
  const isLoggedIn = getCurrentUser() !== null;
  const maxDurationHours = isLoggedIn ? 24 : 3;

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
        <div className="retention-field">
          <label htmlFor="duration-hours">链接保留时长</label>
          <span
            id="retention-note"
            className={
              isLoggedIn
                ? "retention-note retention-note--user"
                : "retention-note retention-note--visitor"
            }
          >
            {isLoggedIn ? "登录用户最长可保留 24 小时" : "未登录用户仅限 3 小时"}
          </span>
          <input
            id="duration-hours"
            type="number"
            min={1}
            max={maxDurationHours}
            value={durationHours}
            aria-describedby="retention-note"
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              setDurationHours(Math.min(maxDurationHours, Math.max(1, nextValue)));
            }}
          />
        </div>
        <label>
          上传到空间
          <input
            value={spaceId}
            placeholder="空间ID"
            onChange={(event) => setSpaceId(event.target.value)}
          />
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
