import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser } from "../auth";
import { CreateSpaceModal } from "../components/CreateSpaceModal";
import { UploadDropzone } from "../components/UploadDropzone";
import type { Space } from "../types";
import type { UploadEntry } from "../uploader";

export function UploadPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [message, setMessage] = useState("");
  const [durationHours, setDurationHours] = useState(3);
  const [spaceId, setSpaceId] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const isLoggedIn = getCurrentUser() !== null;
  const maxDurationHours = isLoggedIn ? 24 : 3;

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    setAuthToken(localStorage.getItem("token") ?? undefined);
    void api.get<Space[]>("/spaces")
      .then(({ data }) => setSpaces(data))
      .catch((error: any) => {
        setMessage(error.response?.data?.message || "空间列表加载失败");
      });

    if (searchParams.get("createSpace") === "1") {
      setCreateSpaceOpen(true);
    }
  }, [isLoggedIn, searchParams]);

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

      <div className="upload-settings">
        <div className="retention-field upload-setting-field">
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
        <div className="upload-setting-field">
          <label htmlFor="space-select">上传到空间</label>
          <span className="space-field-note">在一个空间里分享所有人的作品</span>
          <select
            id="space-select"
            value={spaceId}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue !== "__create_space__") {
                setSpaceId(nextValue);
                return;
              }
              if (isLoggedIn) {
                setCreateSpaceOpen(true);
              } else {
                navigate("/login?mode=register&next=%2Fupload%3FcreateSpace%3D1");
              }
            }}
          >
            <option value="" hidden>仅个人上传（不加入空间）</option>
            <option value="__create_space__">+ 新建空间</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>{space.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        <button type="button" onClick={() => upload(false)}>
          匿名部署
        </button>
        <button type="button" onClick={() => upload(true)}>
          登录后部署
        </button>
      </div>

      {message && <pre className="message">{message}</pre>}
      <CreateSpaceModal
        open={createSpaceOpen}
        onClose={() => setCreateSpaceOpen(false)}
        onCreated={(space) => {
          setSpaces((current) => [...current, space]);
          setSpaceId(space.id);
          setCreateSpaceOpen(false);
          if (searchParams.get("createSpace") === "1") {
            setSearchParams({}, { replace: true });
          }
        }}
      />
    </section>
  );
}
