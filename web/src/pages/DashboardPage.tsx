import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser, notifyAuthChanged } from "../auth";
import { CreateSpaceModal } from "../components/CreateSpaceModal";
import { EditNameButton } from "../components/EditNameButton";
import { EditSpaceModal } from "../components/EditSpaceModal";
import { ProjectNameModal } from "../components/ProjectNameModal";
import { MergeSpacesModal } from "../components/MergeSpacesModal";
import { WorkPreviewCard } from "../components/WorkPreviewCard";
import type { PersonalDeployment, Space, SpaceUploadDeployment } from "../types";

type DashboardPanel = "uploads" | "spaces";

export function getSpaceStatus(space: Space, now = new Date()): "有效" | "已过期" {
  return new Date(space.expiresAt) > now ? "有效" : "已过期";
}

export function DashboardPage() {
  const [activePanel, setActivePanel] = useState<DashboardPanel>("uploads");
  const [personalWorks, setPersonalWorks] = useState<PersonalDeployment[]>([]);
  const [spaceWorks, setSpaceWorks] = useState<SpaceUploadDeployment[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [mergeSpaceOpen, setMergeSpaceOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PersonalDeployment | SpaceUploadDeployment | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [editSpace, setEditSpace] = useState<Space | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [spaceError, setSpaceError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  async function loadDeployments() {
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("请先登录。");
      return;
    }
    setAuthToken(token);
    try {
      const [{ data: personalData }, { data: spaceData }] = await Promise.all([
        api.get<PersonalDeployment[]>("/deployments"),
        api.get<SpaceUploadDeployment[]>("/deployments/space-uploads"),
      ]);
      const now = new Date();
      const isAccessible = (deployment: PersonalDeployment) => (
        !deployment.deletedAt
        && deployment.visibility === "visible"
        && new Date(deployment.expiresAt) > now
      );
      setPersonalWorks(personalData.filter(isAccessible));
      setSpaceWorks(spaceData.filter(isAccessible));
    } catch (error: any) {
      setMessage(error.response?.data?.message || "加载我的上传失败");
    }
  }

  async function loadSpaces() {
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("请先登录。");
      return;
    }
    setAuthToken(token);
    try {
      const { data } = await api.get<Space[]>("/spaces");
      setSpaces(data);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "加载空间失败");
    }
  }

  useEffect(() => {
    setMessage("");
    if (activePanel === "uploads") {
      void loadDeployments();
    } else {
      void loadSpaces();
    }
  }, [activePanel]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthToken();
    notifyAuthChanged();
    navigate("/login");
  }

  function openRename(deployment: PersonalDeployment | SpaceUploadDeployment) {
    setRenameTarget(deployment);
    setRenameValue(deployment.title);
    setRenameError("");
  }

  async function renameDeployment() {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) {
      setRenameError("请输入项目名称");
      return;
    }
    try {
      await api.patch(`/deployments/${renameTarget.id}`, { title });
      setPersonalWorks((current) => current.map((item) => (
        item.id === renameTarget.id ? { ...item, title } : item
      )));
      setSpaceWorks((current) => current.map((item) => (
        item.id === renameTarget.id ? { ...item, title } : item
      )));
      setRenameTarget(null);
      setMessage("作品名称已更新");
    } catch (error: any) {
      setRenameError(error.response?.data?.message || "重命名失败");
    }
  }

  function openEditSpace(space: Space) {
    setEditSpace(space);
    setSpaceName(space.name);
    setSpaceError("");
  }

  async function saveSpaceName() {
    if (!editSpace) return;
    const name = spaceName.trim();
    if (!name || name.length > 80) {
      setSpaceError("空间名称须为 1 至 80 个字");
      return;
    }
    try {
      await api.patch(`/spaces/${editSpace.id}`, { name });
      setSpaces((current) => current.map((space) => space.id === editSpace.id ? { ...space, name } : space));
      setEditSpace(null);
      setMessage("空间名称已更新");
    } catch (error: any) {
      setSpaceError(error.response?.data?.message || "修改空间名称失败");
    }
  }

  async function extendSpace(spaceId: string) {
    try {
      const { data } = await api.post<Space>(`/spaces/${spaceId}/extend`);
      setSpaces((current) => current.map((space) => (
        space.id === spaceId
          ? { ...space, ...data, deploymentCount: space.deploymentCount }
          : space
      )));
      setMessage("空间到期时间已从现在起延长一年");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "延长空间期限失败");
    }
  }

  async function deleteSpace(space: Space) {
    if (!confirm("此操作将永久删除该空间及其中全部作品，无法恢复。确定继续吗？")) {
      return;
    }
    try {
      await api.delete(`/spaces/${space.id}`);
      setSpaces((current) => current.filter((item) => item.id !== space.id));
      setMessage("空间及其中全部作品已永久删除");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "删除空间失败");
    }
  }

  return (
    <section className="card dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">个人控制台</p>
          <h2>{getCurrentUser()?.username ?? "当前用户"}</h2>
        </div>
        <div className="dashboard-header-actions">
          {getCurrentUser()?.role === "ADMIN" && (
            <Link to="/admin">管理后台</Link>
          )}
          <button type="button" onClick={logout}>退出登录</button>
        </div>
      </header>

      <div className="dashboard-tabs" role="tablist" aria-label="控制台板块">
        <button
          type="button"
          className={activePanel === "uploads" ? "dashboard-tab-active" : ""}
          onClick={() => setActivePanel("uploads")}
        >
          我的上传
        </button>
        <button
          type="button"
          className={activePanel === "spaces" ? "dashboard-tab-active" : ""}
          onClick={() => setActivePanel("spaces")}
        >
          空间管理
        </button>
      </div>

      {message && <p className="message dashboard-message">{message}</p>}

      {activePanel === "uploads" && (
        <div className="dashboard-panel">
          <h2>我的上传</h2>
          <p className="hint">
            查看仍可访问的个人作品，以及你上传到各个空间的作品。
          </p>
          <div className="dashboard-upload-columns">
            <section
              className="dashboard-upload-column"
              aria-labelledby="dashboard-personal-works-title"
            >
              <h3 id="dashboard-personal-works-title">个人作品</h3>
              {personalWorks.length === 0 ? (
                <p className="empty-state">你还没有可访问的个人作品。</p>
              ) : (
                <div className="work-card-grid">
                  {personalWorks.map((deployment) => (
                    <WorkPreviewCard
                      key={deployment.id}
                      title={deployment.title}
                      publicSlug={deployment.publicSlug}
                      cardLink
                      meta={`到期时间：${new Date(deployment.expiresAt).toLocaleString()}`}
                      titleAction={<EditNameButton label={`重命名${deployment.title}`} onClick={() => openRename(deployment)} />}
                    />
                  ))}
                </div>
              )}
            </section>
            <section
              className="dashboard-upload-column"
              aria-labelledby="dashboard-space-works-title"
            >
              <h3 id="dashboard-space-works-title">在空间里上传的作品</h3>
              {spaceWorks.length === 0 ? (
                <p className="empty-state">你还没有上传到空间的可访问作品。</p>
              ) : (
                <div className="work-card-grid">
                  {spaceWorks.map((deployment) => (
                    <WorkPreviewCard
                      key={deployment.id}
                      title={deployment.title}
                      publicSlug={deployment.publicSlug}
                      cardLink
                      titleAction={<EditNameButton label={`重命名${deployment.title}`} onClick={() => openRename(deployment)} />}
                      meta={(
                        <div className="space-work-meta">
                          <span>到期时间：{new Date(deployment.expiresAt).toLocaleString()}</span>
                          <Link to={`/s/${deployment.space.slug}`}>
                            {deployment.space.name}
                          </Link>
                        </div>
                      )}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {activePanel === "spaces" && (
        <div className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <h2>空间管理</h2>
              <p className="hint dashboard-space-intro">在一个空间里分享所有人的作品</p>
            </div>
            <div className="dashboard-space-header-actions">
              <button type="button" onClick={() => setCreateSpaceOpen(true)}>新建空间</button>
              <button type="button" onClick={() => setMergeSpaceOpen(true)}
                disabled={spaces.filter((space) => getSpaceStatus(space) === "有效").length < 2}>合并空间</button>
            </div>
          </div>
          {spaces.length === 0 ? (
            <p className="hint">还没有空间，点击“新建空间”开始创建。</p>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>空间</th>
                    <th>网址后缀</th>
                    <th>作品数量</th>
                    <th>到期时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map((space) => {
                    const status = getSpaceStatus(space);
                    return (
                      <tr key={space.id}>
                        <td>
                          {status === "有效" ? (
                            <Link className="dashboard-space-name-link" to={`/s/${space.slug}`}>
                              {space.name}
                            </Link>
                          ) : (
                            <strong>{space.name}</strong>
                          )}
                        </td>
                        <td>/{space.slug}</td>
                        <td>{space.deploymentCount}</td>
                        <td>{new Date(space.expiresAt).toLocaleString()}</td>
                        <td>
                          <span
                            className={`dashboard-status dashboard-status-${
                              status === "有效" ? "active" : "expired"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td>
                          <div className="dashboard-space-actions">
                            <button type="button" onClick={() => openEditSpace(space)}>修改名称</button>
                            {status === "有效" && (
                              <>
                              <button type="button" onClick={() => navigate(`/spaces/${space.id}`)}>进入管理</button>
                              <button
                                type="button"
                                onClick={() => void extendSpace(space.id)}
                              >
                                延长一年
                              </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="dashboard-delete-space"
                              aria-label={`删除${space.name}`}
                              onClick={() => void deleteSpace(space)}
                            >
                              删除空间
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CreateSpaceModal
        open={createSpaceOpen}
        onClose={() => setCreateSpaceOpen(false)}
        onCreated={(space) => {
          setSpaces((current) => [...current, space]);
          setCreateSpaceOpen(false);
          setMessage("空间创建成功");
        }}
      />
      <MergeSpacesModal
        open={mergeSpaceOpen} spaces={spaces}
        onClose={() => setMergeSpaceOpen(false)}
        onMerged={(slug) => {
          setMergeSpaceOpen(false);
          void loadSpaces();
          setMessage(`空间合并成功，新入口：/s/${slug}`);
        }}
      />
      <ProjectNameModal
        open={renameTarget !== null}
        title="重命名作品"
        value={renameValue}
        error={renameError}
        hint={renameTarget && "space" in renameTarget
          ? "名称在该空间内不可与其他项目重复。"
          : "名称用于在“我的作品”中识别这个作品。"}
        confirmLabel="保存名称"
        onChange={setRenameValue}
        onClose={() => setRenameTarget(null)}
        onConfirm={() => void renameDeployment()}
      />
      <EditSpaceModal
        open={editSpace !== null}
        name={spaceName}
        slug={editSpace?.slug ?? ""}
        allowSlug={false}
        error={spaceError}
        onNameChange={setSpaceName}
        onSlugChange={() => undefined}
        onClose={() => setEditSpace(null)}
        onConfirm={() => void saveSpaceName()}
      />
    </section>
  );
}
