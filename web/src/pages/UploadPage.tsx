import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser } from "../auth";
import { CreateSpaceModal } from "../components/CreateSpaceModal";
import { ProjectNameModal } from "../components/ProjectNameModal";
import { UploadDropzone } from "../components/UploadDropzone";
import type { PersonalDeployment, Space, SpaceUploadDeployment } from "../types";
import { suggestProjectName, type UploadEntry } from "../uploader";

export function UploadPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [message, setMessage] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [spaceId, setSpaceId] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [submittedCount, setSubmittedCount] = useState<number | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [projectNameOpen, setProjectNameOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectNameError, setProjectNameError] = useState("");
  const isLoggedIn = getCurrentUser() !== null;
  const selectedSpace = spaces.find((space) => space.id === spaceId);

  async function loadSubmissionCount() {
    try {
      const [{ data: personal }, { data: spaceUploads }] = await Promise.all([
        api.get<PersonalDeployment[]>("/deployments"),
        api.get<SpaceUploadDeployment[]>("/deployments/space-uploads"),
      ]);
      setSubmittedCount(personal.length + spaceUploads.length);
      setOverviewError("");
    } catch {
      setOverviewError("作品数量加载失败");
    }
  }

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
    void loadSubmissionCount();
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

  function openProjectNameModal() {
    if (!entries.length) {
      setMessage("请先选择文件。");
      return;
    }
    if (!hasIndex) {
      setMessage("文件夹上传必须包含 index.html。");
      return;
    }
    setProjectName(suggestProjectName(entries));
    setProjectNameError("");
    setProjectNameOpen(true);
  }

  async function upload() {
    const title = projectName.trim();
    if (!title) {
      setProjectNameError("请输入项目名称");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    entries.forEach((entry) => {
      formData.append("files", entry.file);
      formData.append("paths", entry.path);
    });
    if (spaceId.trim()) {
      formData.append("spaceId", spaceId.trim());
    } else if (isLoggedIn) {
      formData.append("durationDays", String(durationDays));
    }

    try {
      const url = isLoggedIn ? "/deployments" : "/deployments/anonymous";
      const { data } = await api.post(url, formData);
      setProjectNameOpen(false);
      setMessage(`部署成功：${data.url}（到期：${new Date(data.expiresAt).toLocaleString()}）`);
      if (isLoggedIn) void loadSubmissionCount();
    } catch (error: any) {
      setProjectNameError(error.response?.data?.message || "部署失败");
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
          {!isLoggedIn ? (
            <>
              <span className="upload-setting-label">链接保留时长</span>
              <span className="retention-note retention-note--visitor">
                匿名上传固定保留 1 天
              </span>
            </>
          ) : selectedSpace ? (
            <>
              <span className="upload-setting-label">空间到期时间</span>
              <span className="retention-note retention-note--user">
                空间内作品跟随空间到期：{new Date(selectedSpace.expiresAt).toLocaleString()}
              </span>
            </>
          ) : (
            <>
              <label htmlFor="duration-days">链接保留时长（天）</label>
              <span id="retention-note" className="retention-note retention-note--user">
                登录用户最长可保留 30 天
              </span>
              <input
                id="duration-days"
                type="number"
                min={1}
                max={30}
                value={durationDays}
                aria-describedby="retention-note"
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setDurationDays(Math.min(30, Math.max(1, nextValue)));
                }}
              />
            </>
          )}
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
            <option value="">仅个人上传（不加入空间）</option>
            <option value="__create_space__">+ 新建空间</option>
            {spaces.filter((space) => new Date(space.expiresAt) > new Date()).map((space) => (
              <option key={space.id} value={space.id}>{space.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        {isLoggedIn ? (
          <button type="button" onClick={openProjectNameModal}>
            部署
          </button>
        ) : (
          <>
            <button type="button" onClick={openProjectNameModal}>
              匿名部署
            </button>
            <Link className="button-link" to="/login">登录/注册</Link>
          </>
        )}
      </div>

      {message && <pre className="message">{message}</pre>}
      {isLoggedIn && (
        <section className="upload-overview" aria-labelledby="upload-overview-title">
          <div className="upload-overview-summary">
            <div>
              <h3 id="upload-overview-title">我的上传概览</h3>
              <p>累计提交作品 <strong>{submittedCount ?? "—"}</strong> 件</p>
              {overviewError && <p className="message">{overviewError}</p>}
            </div>
            <Link className="button-link" to="/dashboard">我的作品</Link>
          </div>
          <h4>我创建的空间</h4>
          {spaces.length === 0 ? (
            <p className="hint">还没有创建空间。</p>
          ) : (
            <ul className="upload-space-list">
              {spaces.map((space) => {
                const active = new Date(space.expiresAt) > new Date();
                return (
                  <li key={space.id}>
                    {active ? (
                      <Link to={`/s/${space.slug}`}>{space.name}</Link>
                    ) : (
                      <span>{space.name}</span>
                    )}
                    <span className="upload-space-controls">
                      <span className="upload-space-status">{active ? "有效" : "已过期"}</span>
                      {active ? (
                        <Link className="upload-space-manage" to={`/spaces/${space.id}`}>进入管理</Link>
                      ) : (
                        <span className="upload-space-manage-disabled" aria-disabled="true">进入管理</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      <ProjectNameModal
        open={projectNameOpen}
        value={projectName}
        error={projectNameError}
        hint={selectedSpace
          ? "名称在该空间内不可与其他项目重复，仅用于显示。"
          : "名称用于在“我的作品”中识别这个上传作品。"}
        confirmLabel="确认部署"
        onChange={setProjectName}
        onClose={() => setProjectNameOpen(false)}
        onConfirm={() => void upload()}
      />
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
