import { formatDateTime } from "../format-datetime";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser } from "../auth";
import { CreateSpaceModal } from "../components/CreateSpaceModal";
import { ProjectNameModal } from "../components/ProjectNameModal";
import { RetentionSlider } from "../components/RetentionSlider";
import { UploadDropzone } from "../components/UploadDropzone";
import {
  clampDurationDays,
  DEFAULT_DURATION_DAYS,
  MAX_ANONYMOUS_DAYS,
  MAX_PERSONAL_DAYS,
} from "../retention-scale";
import type { PersonalDeployment, Space, SpaceUploadDeployment } from "../types";
import { suggestProjectName, type UploadEntry } from "../uploader";
import { CopyShareLinkButton } from "../components/CopyShareLinkButton";

export function UploadPage() {
  const isLoggedIn = getCurrentUser() !== null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [message, setMessage] = useState("");
  const [durationDays, setDurationDays] = useState(DEFAULT_DURATION_DAYS);
  const [destination, setDestination] = useState<"personal" | "space">("personal");
  const [spaceId, setSpaceId] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spacesStatus, setSpacesStatus] = useState<"loading" | "ready" | "error">(isLoggedIn ? "loading" : "ready");
  const [spacesReload, setSpacesReload] = useState(0);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [submittedCount, setSubmittedCount] = useState<number | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [projectNameOpen, setProjectNameOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectNameError, setProjectNameError] = useState("");
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  const maxDurationDays = isLoggedIn ? MAX_PERSONAL_DAYS : MAX_ANONYMOUS_DAYS;
  const deployDisabled = isLoggedIn
    ? spacesStatus !== "ready" || (destination === "space" && !spaceId)
    : destination === "space";

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
      setSpaces([]);
      setSpaceId("");
      setSpacesStatus("ready");
      return;
    }
    let active = true;
    setSpacesStatus("loading");
    setAuthToken(localStorage.getItem("token") ?? undefined);
    void api.get<Space[]>("/spaces")
      .then(({ data }) => { if (active) { setSpaces(data); setSpacesStatus("ready"); } })
      .catch((error: any) => {
        if (!active) return;
        setSpacesStatus("error");
        setMessage(error.response?.data?.message || "空间列表加载失败");
      });
    void loadSubmissionCount();
    if (searchParams.get("createSpace") === "1") {
      setDestination("space");
      setCreateSpaceOpen(true);
    }
    return () => { active = false; };
  }, [isLoggedIn, searchParams, spacesReload]);

  const hasIndex = useMemo(
    () =>
      entries.some((entry) => entry.path.toLowerCase() === "index.html") ||
      (entries.length === 1 && entries[0].path.toLowerCase().endsWith(".html")),
    [entries],
  );

  function openProjectNameModal() {
    if (deployDisabled) return;
    if (!entries.length) {
      setMessage("请先选择文件。");
      return;
    }
    if (!hasIndex) {
      setMessage("文件夹上传必须包含 index.html。");
      return;
    }
    setProjectName(suggestProjectName(entries));
    setProjectDescription("");
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
    formData.append("description", projectDescription.trim());
    entries.forEach((entry) => {
      formData.append("files", entry.file);
      formData.append("paths", entry.path);
    });
    if (destination === "space" && spaceId.trim()) {
      formData.append("spaceId", spaceId.trim());
    } else {
      formData.append("durationDays", String(clampDurationDays(durationDays, maxDurationDays)));
    }

    try {
      setMessage("");
      setResult(null);
      const url = isLoggedIn ? "/deployments" : "/deployments/anonymous";
      const { data } = await api.post(url, formData);
      setProjectNameOpen(false);
      setResult({ url: data.url, expiresAt: data.expiresAt });
      if (isLoggedIn) void loadSubmissionCount();
    } catch (error: any) {
      setProjectNameError(error.response?.data?.message || "部署失败");
    }
  }

  function chooseSpaceOption(nextValue: string) {
    if (nextValue !== "__create_space__") {
      setSpaceId(nextValue);
      return;
    }
    if (isLoggedIn) {
      setCreateSpaceOpen(true);
    } else {
      navigate("/login?mode=register&next=%2Fupload%3FcreateSpace%3D1");
    }
  }

  return (
    <section className="card">
      <h2>上传并部署</h2>
      <p className="hint">支持单个 HTML 文件或整个文件夹，自动生成临时访问链接。</p>
      <UploadDropzone
        entries={entries}
        onEntriesChange={next => { setEntries(next); setResult(null); }}
        onError={setMessage}
      />

      <div className="upload-settings">
        <div className="upload-settings-section">
          <div
            className="upload-destination"
            role="radiogroup"
            aria-label="选择个人上传或上传到空间"
          >
            <label className={`upload-destination-card${destination === "personal" ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="upload-destination"
                value="personal"
                checked={destination === "personal"}
                onChange={() => {
                  setDestination("personal");
                  setSpaceId("");
                }}
              />
              <span className="upload-destination-title">个人上传</span>
              <span className="upload-destination-hint">
                {isLoggedIn
                  ? "由你选择链接保留时长，最长 30 天。"
                  : "由你选择链接保留时长，可设 1–3 天。登录后最长可保留 30 天。"}
              </span>
            </label>
            <label className={`upload-destination-card${destination === "space" ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="upload-destination"
                value="space"
                checked={destination === "space"}
                onChange={() => setDestination("space")}
              />
              <span className="upload-destination-title">
                上传到空间
                {!isLoggedIn ? (
                  <span className="upload-destination-badge">登录用户专享</span>
                ) : null}
              </span>
              <span className="upload-destination-hint">
                作品跟随空间到期（有效期 1 年，可续期延长）。
              </span>
            </label>
          </div>
        </div>

        {destination === "personal" ? (
          <RetentionSlider
            value={durationDays}
            maxDays={maxDurationDays}
            onChange={setDurationDays}
          />
        ) : (
          <div className="upload-space-picker">
            <span className="upload-space-picker-label" id="space-select-label">选择空间</span>
            <span className="space-field-note">在一个空间里分享所有人的作品</span>
            <div
              className="upload-space-tags"
              role="group"
              aria-labelledby="space-select-label"
              aria-busy={spacesStatus === "loading"}
            >
              {spacesStatus === "loading" && <span role="status">加载空间…</span>}
              {spacesStatus === "error" && <span role="status">空间加载失败</span>}
              {spacesStatus === "ready" && spaces.filter((space) => new Date(space.expiresAt) > new Date()).map((space) => {
                const selected = spaceId === space.id;
                return (
                  <button
                    key={space.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`space-tag-chip upload-space-tag${selected ? " is-selected" : ""}`}
                    onClick={() => chooseSpaceOption(space.id)}
                  >
                    {space.name}
                  </button>
                );
              })}
              <button
                type="button"
                className="space-tag-chip upload-space-tag upload-space-tag-create"
                disabled={isLoggedIn && spacesStatus !== "ready"}
                onClick={() => chooseSpaceOption("__create_space__")}
              >
                新建空间
              </button>
            </div>
            {spacesStatus === "error" && <button type="button" onClick={() => { setMessage(""); setSpacesReload(value => value + 1); }}>重新加载空间</button>}
            {selectedSpace && (
              <span className="retention-note retention-note--user">
                空间内作品跟随空间到期：{formatDateTime(selectedSpace.expiresAt)}
              </span>
            )}
          </div>
        )}

        <div className="upload-settings-actions">
          {isLoggedIn ? (
            <button
              type="button"
              className="upload-deploy-button"
              disabled={deployDisabled}
              onClick={openProjectNameModal}
            >
              部署
            </button>
          ) : (
            <>
              <button
                type="button"
                className="upload-deploy-button"
                disabled={deployDisabled}
                onClick={openProjectNameModal}
              >
                匿名部署
              </button>
              <Link className="button-link" to="/login">登录/注册</Link>
            </>
          )}
        </div>
      </div>

      {message && <pre className="message">{message}</pre>}
      {result && <section className="upload-result" aria-label="部署成功" aria-live="polite">
        <strong>部署成功</strong>
        <div className="upload-result-link">
          <a href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
          <CopyShareLinkButton key={result.url} title="部署链接" href={result.url} />
        </div>
        <p>到期：{formatDateTime(result.expiresAt)}</p>
      </section>}
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
          {spacesStatus === "loading" ? <p role="status">正在加载空间…</p> : spacesStatus === "error" ? null : spaces.length === 0 ? (
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
        description={projectDescription}
        onDescriptionChange={setProjectDescription}
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
          setDestination("space");
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
