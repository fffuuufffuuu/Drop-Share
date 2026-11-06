import { formatDateTime } from "../format-datetime";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { WorkViewCount } from "../components/WorkViewCount";
import { api, setAuthToken, logoutSession } from "../api";
import { getCurrentUser } from "../auth";
import { CreateSpaceModal } from "../components/CreateSpaceModal";
import { EditNameButton } from "../components/EditNameButton";
import { EditSpaceModal } from "../components/EditSpaceModal";
import { ProjectNameModal } from "../components/ProjectNameModal";
import { MergeSpacesModal } from "../components/MergeSpacesModal";
import { WorkVersionActions } from "../components/WorkVersionActions";
import { WorkCardGrid } from "../components/WorkCardGrid";
import { WorkPreviewCard } from "../components/WorkPreviewCard";
import { WorkActionIcon } from "../components/WorkActionIcon";
import { downloadZip } from "../download";
import type { PersonalDeployment, Space, SpaceUploadDeployment } from "../types";
import { AccountSettings } from "../components/AccountSettings";
import { NotificationsPanel, UnreadDot, useNotifications } from "../components/Notifications";

type DashboardPanel = "uploads" | "spaces" | "messages" | "account";

export function getSpaceStatus(space: Space, now = new Date()): "有效" | "已过期" {
  return new Date(space.expiresAt) > now ? "有效" : "已过期";
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const activePanel: DashboardPanel = params.get("tab") === "account" ? "account" : params.get("tab") === "messages" ? "messages" : params.get("tab") === "spaces" ? "spaces" : "uploads";
  const requestedWork = params.get("work");
  const { unreadCount } = useNotifications();
  const setActivePanel = (panel: DashboardPanel) => setParams(panel === "uploads" ? {} : { tab: panel });
  const [personalWorks, setPersonalWorks] = useState<PersonalDeployment[]>([]);
  const [spaceWorks, setSpaceWorks] = useState<SpaceUploadDeployment[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [uploadsStatus, setUploadsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spacesStatus, setSpacesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [mergeSpaceOpen, setMergeSpaceOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PersonalDeployment | SpaceUploadDeployment | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [editSpace, setEditSpace] = useState<Space | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [spaceError, setSpaceError] = useState("");
  const [message, setMessage] = useState("");
  const [busyWorkId, setBusyWorkId] = useState<string | null>(null);
  const navigate = useNavigate();

  async function loadDeployments() {
    setUploadsStatus("loading");
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("请先登录。");
      setUploadsStatus("error");
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
        && new Date(deployment.expiresAt) > now
      );
      setPersonalWorks(personalData.filter(isAccessible));
      setSpaceWorks(spaceData.filter(isAccessible));
      setUploadsStatus("ready");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "加载我的上传失败");
      setUploadsStatus("error");
    }
  }

  async function loadSpaces() {
    setSpacesStatus("loading");
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("请先登录。");
      setSpacesStatus("error");
      return;
    }
    setAuthToken(token);
    try {
      const { data } = await api.get<Space[]>("/spaces");
      setSpaces(data);
      setSpacesStatus("ready");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "加载空间失败");
      setSpacesStatus("error");
    }
  }

  useEffect(() => {
    setMessage("");
    if (activePanel === "uploads") {
      void loadDeployments();
    } else if (activePanel === "spaces") {
      void loadSpaces();
    }
  }, [activePanel]);

  function logout() {
    void logoutSession();
    navigate("/login");
  }

  function openRename(deployment: PersonalDeployment | SpaceUploadDeployment) {
    setRenameTarget(deployment);
    setRenameValue(deployment.title);
    setRenameError("");
  }

  async function manageWork(deployment: PersonalDeployment, action: "download" | "toggle" | "delete") {
    if (busyWorkId) return;
    if (action === "delete" && !confirm(`确定删除“${deployment.title}”吗？作品文件和分享链接将被移除，无法恢复。`)) return;
    setBusyWorkId(deployment.id);
    try {
      if (action === "download") {
        await downloadZip(`/deployments/${deployment.id}/download`, `${deployment.title}.zip`);
        setMessage("作品下载已开始");
      } else if (action === "toggle") {
        const visibility = deployment.visibility === "visible" ? "hidden" : "visible";
        await api.patch(`/deployments/${deployment.id}`, { visibility });
        const update = <T extends PersonalDeployment,>(items: T[]) => items.map(item => item.id === deployment.id ? { ...item, visibility } : item);
        setPersonalWorks(update); setSpaceWorks(update);
        setMessage(visibility === "hidden" ? "作品已隐藏，可随时重新显示" : "作品已显示");
      } else {
        await api.delete(`/deployments/${deployment.id}`);
        setPersonalWorks(items => items.filter(item => item.id !== deployment.id));
        setSpaceWorks(items => items.filter(item => item.id !== deployment.id));
        setMessage("作品已删除");
      }
    } catch (error: any) {
      setMessage(error.response?.data?.message || (action === "download" ? "下载失败" : action === "toggle" ? "切换显示状态失败" : "删除失败"));
    } finally { setBusyWorkId(null); }
  }

  function workActions(deployment: PersonalDeployment) {
    const visible = deployment.visibility === "visible";
    return <>
      {deployment.canUpdate === true && <WorkVersionActions work={deployment} action="update" onChanged={loadDeployments} />}
      {deployment.canRollback === true && deployment.hasPreviousVersion === true && <WorkVersionActions work={deployment} action="rollback" onChanged={loadDeployments} />}
      <button type="button" className="work-icon-action" aria-label={`下载${deployment.title}`} title="下载作品" disabled={busyWorkId !== null} onClick={() => void manageWork(deployment, "download")}><WorkActionIcon type="download" /></button>
      <button type="button" className="work-icon-action" aria-label={`${visible ? "隐藏" : "显示"}${deployment.title}`} title={visible ? "隐藏作品" : "显示作品"} disabled={busyWorkId !== null} onClick={() => void manageWork(deployment, "toggle")}><WorkActionIcon type={visible ? "hide" : "show"} /></button>
      <button type="button" className="work-icon-action work-icon-action-danger" aria-label={`删除${deployment.title}`} title="删除作品" disabled={busyWorkId !== null} onClick={() => void manageWork(deployment, "delete")}><WorkActionIcon type="delete" /></button>
    </>;
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

  const hiddenWorks = [...personalWorks, ...spaceWorks].filter(work => work.visibility === "hidden");
  const renderWork = (deployment: PersonalDeployment | SpaceUploadDeployment) => (
    <WorkPreviewCard
      key={deployment.id}
      workId={deployment.id}
      title={deployment.title}
      publicSlug={deployment.publicSlug}
      thumbnailVersion={deployment.thumbnailVersion}
      viewCount={deployment.viewCount}
      uploaderName={getCurrentUser()?.username}
      cardLink
      hidden={deployment.visibility === "hidden"}
      focusRequested={requestedWork === deployment.id}
      tags={<span className={`work-visibility work-visibility-${deployment.visibility}`}>{deployment.visibility === "hidden" ? "已隐藏" : "显示中"}</span>}
      actions={workActions(deployment)}
      meta={"space" in deployment ? <div className="space-work-meta">
        <span>到期时间：{formatDateTime(deployment.expiresAt)}</span>
        <Link to={`/s/${deployment.space.slug}`}>{deployment.space.name}</Link>
      </div> : `到期时间：${formatDateTime(deployment.expiresAt)}`}
      titleAction={<EditNameButton label={`重命名${deployment.title}`} onClick={() => openRename(deployment)} />}
    />
  );

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
          role="tab" aria-selected={activePanel === "uploads"}
          className={activePanel === "uploads" ? "dashboard-tab-active" : ""}
          onClick={() => setActivePanel("uploads")}
        >
          我的上传
        </button>
        <button
          type="button"
          role="tab" aria-selected={activePanel === "spaces"}
          className={activePanel === "spaces" ? "dashboard-tab-active" : ""}
          onClick={() => setActivePanel("spaces")}
        >
          空间管理
        </button>
        <button type="button" role="tab" aria-selected={activePanel === "messages"}
          className={activePanel === "messages" ? "dashboard-tab-active" : ""} onClick={() => setActivePanel("messages")}
          title={unreadCount ? `${unreadCount} 条未读消息` : undefined}><span className="dashboard-message-tab-label">消息<UnreadDot count={unreadCount} /></span></button>
        <button type="button" role="tab" aria-selected={activePanel === "account"}
          className={activePanel === "account" ? "dashboard-tab-active" : ""} onClick={() => setActivePanel("account")}>账号设置</button>
      </div>

      {message && <p className="message dashboard-message">{message}</p>}
      {activePanel === "messages" && <NotificationsPanel />}
      {activePanel === "account" && <AccountSettings />}

      {activePanel === "uploads" && (
        <div className="dashboard-panel">
          <h2>我的上传</h2>
          <p className="hint">
            管理个人作品和上传到空间的作品，隐藏的作品也可以在这里重新显示。
          </p>
          {uploadsStatus === "loading" ? <p role="status">正在加载作品…</p> : uploadsStatus === "ready" ? <div className="dashboard-upload-columns">
            <section
              className="dashboard-upload-column"
              aria-labelledby="dashboard-personal-works-title"
            >
              <h3 id="dashboard-personal-works-title">个人作品</h3>
              {personalWorks.filter(work => work.visibility !== "hidden").length === 0 ? (
                <p className="empty-state">你还没有可访问的个人作品。</p>
              ) : (
                <WorkCardGrid>
                  {personalWorks.filter(work => work.visibility !== "hidden").map(renderWork)}
                </WorkCardGrid>
              )}
            </section>
            <section
              className="dashboard-upload-column"
              aria-labelledby="dashboard-space-works-title"
            >
              <h3 id="dashboard-space-works-title">在空间里上传的作品</h3>
              {spaceWorks.filter(work => work.visibility !== "hidden").length === 0 ? (
                <p className="empty-state">你还没有上传到空间的可访问作品。</p>
              ) : (
                <WorkCardGrid>
                  {spaceWorks.filter(work => work.visibility !== "hidden").map(renderWork)}
                </WorkCardGrid>
              )}
            </section>
            {hiddenWorks.length > 0 && <section className="dashboard-upload-column hidden-work-section" aria-labelledby="dashboard-hidden-work-title">
              <h3 id="dashboard-hidden-work-title">未显示作品</h3>
              <WorkCardGrid>{hiddenWorks.map(renderWork)}</WorkCardGrid>
            </section>}
          </div> : null}
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
                disabled={spaces.filter((space) => space.isOwner !== false && getSpaceStatus(space) === "有效").length < 2}>合并空间</button>
            </div>
          </div>
          {spacesStatus === "loading" ? <p role="status">正在加载空间…</p> : spacesStatus === "error" ? null : spaces.length === 0 ? (
            <p className="hint">还没有空间，点击“新建空间”开始创建。</p>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>空间</th>
                    <th>网址后缀</th>
                    <th>作品数量</th>
                    <th>访问次数</th>
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
                        <td><WorkViewCount count={space.viewCount} /></td>
                        <td>{formatDateTime(space.expiresAt)}</td>
                        <td>
                          <span
                            className={`dashboard-status dashboard-status-${
                              status === "有效" ? "active" : "expired"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="dashboard-space-actions-cell">
                          <div className="dashboard-space-actions">
                            {space.isOwner !== false && <button type="button" className="work-icon-action"
                              aria-label={`修改${space.name}名称`} title="修改名称"
                              onClick={() => openEditSpace(space)}>
                              <WorkActionIcon type="edit" />
                            </button>}
                            {status === "有效" && (
                              <>
                              <button type="button" className="work-icon-action"
                                aria-label={`进入${space.name}管理`} title="进入管理"
                                onClick={() => navigate(`/spaces/${space.id}`)}>
                                <WorkActionIcon type="manage" />
                              </button>
                              <button
                                type="button"
                                className="work-icon-action"
                                aria-label={`为${space.name}延长一年`} title="延长一年"
                                onClick={() => void extendSpace(space.id)}
                              >
                                <WorkActionIcon type="extend" />
                              </button>
                              </>
                            )}
                            {space.isOwner !== false && <button
                              type="button"
                              className="work-icon-action work-icon-action-danger"
                              aria-label={`删除${space.name}`}
                              title="删除空间"
                              onClick={() => void deleteSpace(space)}
                            >
                              <WorkActionIcon type="delete" />
                            </button>}
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
        open={mergeSpaceOpen} spaces={spaces.filter(space => space.isOwner !== false)}
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
