import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser } from "../auth";
import { CreateSpaceModal } from "../components/CreateSpaceModal";
import { UploadDropzone } from "../components/UploadDropzone";
import { WorkPreviewCard } from "../components/WorkPreviewCard";
import type { PersonalDeployment, Space, SpaceUploadDeployment } from "../types";
import type { UploadEntry } from "../uploader";

export function UploadPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [message, setMessage] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [spaceId, setSpaceId] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [personalWorks, setPersonalWorks] = useState<PersonalDeployment[]>([]);
  const [personalWorksError, setPersonalWorksError] = useState("");
  const [spaceWorks, setSpaceWorks] = useState<SpaceUploadDeployment[]>([]);
  const [spaceWorksError, setSpaceWorksError] = useState("");
  const isLoggedIn = getCurrentUser() !== null;
  const selectedSpace = spaces.find((space) => space.id === spaceId);

  async function loadPersonalWorks() {
    try {
      const { data } = await api.get<PersonalDeployment[]>("/deployments");
      const now = new Date();
      setPersonalWorks(data.filter((deployment) => (
        !deployment.deletedAt
        && deployment.visibility === "visible"
        && new Date(deployment.expiresAt) > now
      )));
      setPersonalWorksError("");
    } catch (error: any) {
      setPersonalWorksError(
        error.response?.data?.message || "个人作品加载失败，请稍后重试。",
      );
    }
  }

  async function loadSpaceWorks() {
    try {
      const { data } = await api.get<SpaceUploadDeployment[]>("/deployments/space-uploads");
      const now = new Date();
      setSpaceWorks(data.filter((deployment) => (
        !deployment.deletedAt
        && deployment.visibility === "visible"
        && new Date(deployment.expiresAt) > now
      )));
      setSpaceWorksError("");
    } catch (error: any) {
      setSpaceWorksError(
        error.response?.data?.message || "空间作品加载失败，请稍后重试。",
      );
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
    void loadPersonalWorks();
    void loadSpaceWorks();

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

  async function upload() {
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
    if (spaceId.trim()) {
      formData.append("spaceId", spaceId.trim());
    } else if (isLoggedIn) {
      formData.append("durationDays", String(durationDays));
    }

    try {
      const url = isLoggedIn ? "/deployments" : "/deployments/anonymous";
      const { data } = await api.post(url, formData);
      setMessage(`部署成功：${data.url}（到期：${new Date(data.expiresAt).toLocaleString()}）`);
      if (isLoggedIn) {
        await Promise.all([loadPersonalWorks(), loadSpaceWorks()]);
      }
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
          <button type="button" onClick={() => void upload()}>
            部署
          </button>
        ) : (
          <>
            <button type="button" onClick={() => void upload()}>
              匿名部署
            </button>
            <Link className="button-link" to="/login">登录/注册</Link>
          </>
        )}
      </div>

      {message && <pre className="message">{message}</pre>}
      <section className="upload-work-section">
        {isLoggedIn ? (
          <div className="upload-work-columns">
            <section
              className="upload-work-column"
              aria-labelledby="personal-work-title"
            >
              <h2 id="personal-work-title">我的个人作品</h2>
              {personalWorksError ? (
                <p className="message">{personalWorksError}</p>
              ) : personalWorks.length === 0 ? (
                <p className="empty-state">
                  你还没有可访问的个人作品，上传后会显示在这里。
                </p>
              ) : (
                <div className="work-card-grid">
                  {personalWorks.map((deployment) => (
                    <WorkPreviewCard
                      key={deployment.id}
                      title={deployment.title}
                      publicSlug={deployment.publicSlug}
                      meta={`到期时间：${new Date(deployment.expiresAt).toLocaleString()}`}
                    />
                  ))}
                </div>
              )}
            </section>
            <section
              className="upload-work-column"
              aria-labelledby="space-upload-work-title"
            >
              <h2 id="space-upload-work-title">我上传到空间的作品</h2>
              {spaceWorksError ? (
                <p className="message">{spaceWorksError}</p>
              ) : spaceWorks.length === 0 ? (
                <p className="empty-state">
                  你还没有上传到空间的可访问作品。
                </p>
              ) : (
                <div className="work-card-grid">
                  {spaceWorks.map((deployment) => (
                    <WorkPreviewCard
                      key={deployment.id}
                      title={deployment.title}
                      publicSlug={deployment.publicSlug}
                      meta={(
                        <div className="space-work-meta">
                          <span>到期时间：{new Date(deployment.expiresAt).toLocaleString()}</span>
                          <span>
                            所在空间：
                            <Link to={`/s/${deployment.space.slug}`}>
                              {deployment.space.name}
                            </Link>
                          </span>
                        </div>
                      )}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="visitor-work-prompt">
            <p>注册登录后，即可管理自己上传的所有作品。</p>
            <Link to="/login" aria-label="登录/注册，管理作品">登录/注册</Link>
          </div>
        )}
      </section>
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
