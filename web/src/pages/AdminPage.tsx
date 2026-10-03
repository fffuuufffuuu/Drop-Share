import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser, notifyAuthChanged } from "../auth";
import { EditSpaceModal } from "../components/EditSpaceModal";
import { SpaceDownloadSwitch } from "../components/SpaceDownloadSwitch";
import { MergeSpacesModal } from "../components/MergeSpacesModal";
import { SpaceTagControls, TagChips, TagFilter } from "../components/SpaceTagControls";
import type {
  AdminDeployment,
  AdminSpace,
  AdminSpaceDetail,
  SpaceTag,
} from "../types";

type Panel = "personal" | "spaces";
type DeleteTarget =
  | { kind: "deployment"; id: string; name: string }
  | { kind: "space"; id: string; name: string };

function errorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object"
    && error !== null
    && "response" in error
    && typeof error.response === "object"
    && error.response !== null
    && "data" in error.response
    && typeof error.response.data === "object"
    && error.response.data !== null
    && "message" in error.response.data
    && typeof error.response.data.message === "string"
  ) {
    return error.response.data.message;
  }
  return fallback;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN");
}

function filenameFromDisposition(disposition: unknown, fallback: string): string {
  if (typeof disposition !== "string") return fallback;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

function DeploymentTable({
  deployments,
  onDownload,
  onDelete,
  onToggleVisibility,
  showExpiration = true,
  titleLinksToPreview = false,
  selection,
}: {
  deployments: AdminDeployment[];
  onDownload: (deployment: AdminDeployment) => void;
  onDelete: (deployment: AdminDeployment) => void;
  onToggleVisibility?: (
    deployment: AdminDeployment,
    visibility: "visible" | "hidden",
  ) => void;
  showExpiration?: boolean;
  titleLinksToPreview?: boolean;
  selection?: { ids: string[]; onChange: (ids: string[]) => void; tags: SpaceTag[] };
}) {
  if (!deployments.length) {
    return <p className="admin-empty">当前没有可管理的网页。</p>;
  }

  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            {selection && <th><input type="checkbox" aria-label="选择当前分类全部作品"
              checked={deployments.length > 0 && deployments.every((item) => selection.ids.includes(item.id))}
              onChange={(event) => selection.onChange(event.target.checked
                ? Array.from(new Set([...selection.ids, ...deployments.map((item) => item.id)])).slice(0, 200)
                : selection.ids.filter((id) => !deployments.some((item) => item.id === id)))} /></th>}
            <th>网页</th>
            {selection && <th>标签</th>}
            <th>上传者</th>
            <th>上传时间</th>
            {showExpiration && <th>到期时间</th>}
            <th className="admin-status-column">状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {deployments.map((deployment) => (
            <tr key={deployment.id}>
              {selection && <td><input type="checkbox" aria-label={`选择${deployment.title}`}
                checked={selection.ids.includes(deployment.id)}
                onChange={() => selection.onChange(selection.ids.includes(deployment.id)
                  ? selection.ids.filter((id) => id !== deployment.id)
                  : selection.ids.length < 200 ? [...selection.ids, deployment.id] : selection.ids)} /></td>}
              <td>
                <a
                  className="admin-work-title-link"
                  href={`/p/${deployment.publicSlug}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{deployment.title}</strong>
                </a>
                <a
                  className="admin-page-link"
                  href={`/p/${deployment.publicSlug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  /p/{deployment.publicSlug}
                </a>
              </td>
              {selection && <td><TagChips tags={selection.tags} tagIds={deployment.tagIds ?? []} /></td>}
              <td>{deployment.ownerLabel}</td>
              <td>{formatDate(deployment.createdAt)}</td>
              {showExpiration && <td>{formatDate(deployment.expiresAt)}</td>}
              <td className="admin-status-column">
                <span className={`admin-status admin-status-${deployment.visibility}`}>
                  {deployment.visibility === "visible" ? "显示中" : "已隐藏"}
                </span>
              </td>
              <td>
                <div className="admin-actions">
                  {!titleLinksToPreview && (
                    <a className="admin-action-link" href={`/p/${deployment.publicSlug}`} target="_blank" rel="noreferrer">
                      预览
                    </a>
                  )}
                  {onToggleVisibility && (
                    <button
                      type="button"
                      aria-label={
                        deployment.visibility === "visible"
                          ? `隐藏${deployment.title}`
                          : `显示${deployment.title}`
                      }
                      onClick={() => onToggleVisibility(
                        deployment,
                        deployment.visibility === "visible" ? "hidden" : "visible",
                      )}
                    >
                      {deployment.visibility === "visible" ? "隐藏" : "显示"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`下载${deployment.title} ZIP`}
                    onClick={() => onDownload(deployment)}
                  >
                    下载 ZIP
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    aria-label={`永久删除${deployment.title}`}
                    onClick={() => onDelete(deployment)}
                  >
                    永久删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPage() {
  const currentUser = getCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedSpaceId = searchParams.get("spaceId");
  const [panel, setPanel] = useState<Panel>("personal");
  const [personal, setPersonal] = useState<AdminDeployment[]>([]);
  const [spaces, setSpaces] = useState<AdminSpace[]>([]);
  const [detail, setDetail] = useState<AdminSpaceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingSpace, setEditingSpace] = useState<AdminSpace | AdminSpaceDetail | null>(null);
  const [mergeSpaceOpen, setMergeSpaceOpen] = useState(false);
  const [spaceName, setSpaceName] = useState("");
  const [spaceSlug, setSpaceSlug] = useState("");
  const [spaceEditError, setSpaceEditError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const filteredSpaceDeployments = detail?.deployments.filter((deployment) =>
    !tagFilter || (deployment.tagIds ?? []).includes(tagFilter)) ?? [];

  async function loadPersonal() {
    setLoading(true);
    setMessage("");
    try {
      const { data } = await api.get<AdminDeployment[]>("/admin/deployments/personal");
      setPersonal(data);
    } catch (error) {
      setMessage(errorMessage(error, "个人上传加载失败，请重试。"));
    } finally {
      setLoading(false);
    }
  }

  async function loadSpaces() {
    setLoading(true);
    setMessage("");
    try {
      const { data } = await api.get<AdminSpace[]>("/admin/spaces");
      setSpaces(data);
    } catch (error) {
      setMessage(errorMessage(error, "空间加载失败，请重试。"));
    } finally {
      setLoading(false);
    }
  }

  async function loadSpaceDetail(spaceId: string) {
    setLoading(true);
    setMessage("");
    try {
      const { data } = await api.get<AdminSpaceDetail>(`/admin/spaces/${spaceId}`);
      setDetail(data);
    } catch (error) {
      setMessage(errorMessage(error, "空间详情加载失败，请重试。"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return;
    setAuthToken(localStorage.getItem("token") ?? undefined);
    if (requestedSpaceId) {
      setPanel("spaces");
      void Promise.all([loadSpaces(), loadSpaceDetail(requestedSpaceId)]);
    } else {
      void loadPersonal();
    }
  }, [requestedSpaceId]);

  async function selectPanel(nextPanel: Panel) {
    setPanel(nextPanel);
    setDetail(null);
    setSelectedIds([]);
    setTagFilter(null);
    if (nextPanel === "personal") {
      await loadPersonal();
    } else {
      await loadSpaces();
    }
  }

  async function download(url: string, fallback: string) {
    setMessage("");
    try {
      const response = await api.get(url, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filenameFromDisposition(
        response.headers?.["content-disposition"],
        fallback,
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage("ZIP 下载已开始。");
    } catch (error) {
      setMessage(errorMessage(error, "下载失败，请重试。"));
    }
  }

  async function toggleDeploymentVisibility(
    deployment: AdminDeployment,
    visibility: "visible" | "hidden",
  ) {
    setMessage("");
    try {
      await api.patch(`/admin/deployments/${deployment.id}`, { visibility });
      setDetail((current) => {
        if (!current) return current;
        return {
          ...current,
          deployments: current.deployments.map((item) => (
            item.id === deployment.id ? { ...item, visibility } : item
          )),
        };
      });
      setMessage(visibility === "visible" ? "作品已显示。" : "作品已隐藏。");
    } catch (error) {
      setMessage(errorMessage(error, "更新显示状态失败，请重试。"));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "deployment") {
        await api.delete(`/admin/deployments/${deleteTarget.id}`);
        if (detail) {
          await loadSpaceDetail(detail.id);
        } else {
          await loadPersonal();
        }
        setMessage("网页已永久删除。");
      } else {
        await api.delete(`/admin/spaces/${deleteTarget.id}`);
        setDetail(null);
        await loadSpaces();
        setMessage("空间已永久删除。");
      }
      setDeleteTarget(null);
    } catch (error) {
      setMessage(errorMessage(error, "永久删除失败，请重试。"));
    } finally {
      setDeleting(false);
    }
  }

  function openEditSpace(space: AdminSpace | AdminSpaceDetail) {
    setEditingSpace(space);
    setSpaceName(space.name);
    setSpaceSlug(space.slug);
    setSpaceEditError("");
  }

  async function saveSpace() {
    if (!editingSpace) return;
    const name = spaceName.trim();
    const slug = spaceSlug.trim();
    if (!name || name.length > 80 || !/^[a-z0-9-]{2,40}$/.test(slug)) {
      setSpaceEditError("空间名称须为 1 至 80 个字；slug 须为 2 至 40 位小写字母、数字或连字符");
      return;
    }
    try {
      await api.patch(`/admin/spaces/${editingSpace.id}`, { name, slug });
      setSpaces((current) => current.map((space) => space.id === editingSpace.id ? { ...space, name, slug } : space));
      setDetail((current) => current?.id === editingSpace.id ? { ...current, name, slug } : current);
      setEditingSpace(null);
      setMessage("空间信息已更新。修改 slug 后请使用新入口链接。");
    } catch (error) {
      setSpaceEditError(errorMessage(error, "修改空间失败，请重试。"));
    }
  }

  async function toggleSpaceDownloads(enabled: boolean) {
    if (!detail) return;
    try {
      await api.patch(`/admin/spaces/${detail.id}/downloads`, { downloadsEnabled: enabled });
      setDetail({ ...detail, downloadsEnabled: enabled });
      setSpaces((current) => current.map((space) => space.id === detail.id
        ? { ...space, downloadsEnabled: enabled } : space));
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error, "修改下载权限失败"));
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthToken();
    notifyAuthChanged();
    navigate("/login");
  }

  if (currentUser?.role !== "ADMIN") {
    return (
      <section className="card">
        <h2>仅管理员可访问</h2>
        <p>请使用管理员账号登录后再试。</p>
      </section>
    );
  }

  return (
    <section className="card admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Drop&amp;Share / 管理员</p>
          <h2>管理后台</h2>
          <p>当前管理员：{currentUser.username}</p>
        </div>
        <button type="button" onClick={logout}>退出登录</button>
      </header>

      <div className="admin-tabs" role="tablist" aria-label="后台板块">
        <button
          type="button"
          className={panel === "personal" ? "admin-tab-active" : ""}
          onClick={() => void selectPanel("personal")}
        >
          个人上传
        </button>
        <button
          type="button"
          className={panel === "spaces" ? "admin-tab-active" : ""}
          onClick={() => void selectPanel("spaces")}
        >
          空间
        </button>
      </div>

      {message && <p className="admin-message" role="status">{message}</p>}
      {loading && <p className="admin-loading">正在加载…</p>}

      {!loading && panel === "personal" && (
        <div className="admin-panel">
          <h3>个人上传</h3>
          <p>包括登录用户与匿名上传，按上传时间从新到旧排列。</p>
          <DeploymentTable
            deployments={personal}
            onDownload={(deployment) => void download(
              `/admin/deployments/${deployment.id}/download`,
              `${deployment.title}.zip`,
            )}
            onDelete={(deployment) => setDeleteTarget({
              kind: "deployment",
              id: deployment.id,
              name: deployment.title,
            })}
          />
        </div>
      )}

      {!loading && panel === "spaces" && !detail && (
        <div className="admin-panel">
          <div className="admin-space-heading">
            <h3>空间</h3>
            <button type="button" onClick={() => setMergeSpaceOpen(true)}
              disabled={!spaces.some((space) => new Date(space.expiresAt) > new Date()
                && spaces.some((other) => other.id !== space.id
                  && other.ownerUserId === space.ownerUserId
                  && new Date(other.expiresAt) > new Date()))}>合并空间</button>
          </div>
          {!spaces.length ? (
            <p className="admin-empty">当前没有空间。</p>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>空间</th>
                    <th>创建者</th>
                    <th>创建时间</th>
                    <th>空间到期时间</th>
                    <th>网页数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map((space) => (
                    <tr key={space.id}>
                      <td><a className="admin-work-title-link" href={`/s/${space.slug}`} target="_blank" rel="noreferrer"><strong>{space.name}</strong></a><span className="admin-page-link">/{space.slug}</span></td>
                      <td>{space.ownerUsername}</td>
                      <td>{formatDate(space.createdAt)}</td>
                      <td>{formatDate(space.expiresAt)}</td>
                      <td>{space.deploymentCount}</td>
                      <td>
                        <div className="admin-actions">
                          <button
                            type="button"
                            aria-label={`查看${space.name}详情`}
                            onClick={() => {
                              setSelectedIds([]);
                              setTagFilter(null);
                              void loadSpaceDetail(space.id);
                            }}
                          >
                            查看详情
                          </button>
                          <button type="button" onClick={() => openEditSpace(space)}>编辑空间</button>
                          <button
                            type="button"
                            aria-label={`下载空间${space.name} ZIP`}
                            onClick={() => void download(
                              `/admin/spaces/${space.id}/download`,
                              `${space.name}.zip`,
                            )}
                          >
                            下载 ZIP
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            aria-label={`永久删除空间${space.name}`}
                            onClick={() => setDeleteTarget({
                              kind: "space",
                              id: space.id,
                              name: space.name,
                            })}
                          >
                            永久删除空间
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && panel === "spaces" && detail && (
        <div className="admin-panel">
          <div className="admin-detail-header">
            <div>
              <button type="button" className="admin-back" onClick={() => setDetail(null)}>
                返回空间列表
              </button>
              <h3><a className="admin-work-title-link" href={`/s/${detail.slug}`} target="_blank" rel="noreferrer">{detail.name}</a></h3>
              <p>/{detail.slug} · 创建者 {detail.ownerUsername}</p>
              <p>空间内作品统一于 {formatDate(detail.expiresAt)} 到期</p>
            </div>
            <div className="admin-actions">
              <button type="button" onClick={() => openEditSpace(detail)}>编辑空间</button>
              <button
                type="button"
                onClick={() => void download(
                  `/admin/spaces/${detail.id}/download`,
                  `${detail.name}.zip`,
                )}
              >
                下载整个空间 ZIP
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => setDeleteTarget({
                  kind: "space",
                  id: detail.id,
                  name: detail.name,
                })}
              >
                永久删除空间
              </button>
            </div>
          </div>
          <SpaceDownloadSwitch enabled={detail.downloadsEnabled ?? false}
            onToggle={(enabled) => void toggleSpaceDownloads(enabled)} />
          <SpaceTagControls
            admin spaceId={detail.id} tags={detail.tags ?? []} selectedIds={selectedIds}
            activeTagId={tagFilter} onActiveTagChange={setTagFilter}
            onSelectionClear={() => setSelectedIds([])} onRefresh={() => loadSpaceDetail(detail.id)}
          />
          <section className="space-work-list-panel" aria-label="空间作品列表">
            <TagFilter tags={detail.tags ?? []} selectedId={tagFilter} onChange={setTagFilter} />
            <DeploymentTable
              deployments={filteredSpaceDeployments}
              showExpiration={false}
              titleLinksToPreview
              selection={{ ids: selectedIds, onChange: setSelectedIds, tags: detail.tags ?? [] }}
              onToggleVisibility={(deployment, visibility) => {
                void toggleDeploymentVisibility(deployment, visibility);
              }}
              onDownload={(deployment) => void download(
                `/admin/deployments/${deployment.id}/download`,
                `${deployment.title}.zip`,
              )}
              onDelete={(deployment) => setDeleteTarget({
                kind: "deployment",
                id: deployment.id,
                name: deployment.title,
              })}
            />
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="admin-modal-overlay" role="presentation">
          <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <p className="admin-eyebrow">不可撤销</p>
            <h3 id="delete-title">永久删除“{deleteTarget.name}”？</h3>
            <p>
              {deleteTarget.kind === "space"
                ? "空间及其中所有网页都会永久删除，文件无法恢复。"
                : "删除后文件无法恢复，该网页记录也会永久移除。"}
            </p>
            <div className="admin-modal-actions">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? "正在删除…" : "确认永久删除"}
              </button>
            </div>
          </div>
        </div>
      )}
      <EditSpaceModal
        open={editingSpace !== null}
        name={spaceName}
        slug={spaceSlug}
        allowSlug
        error={spaceEditError}
        onNameChange={setSpaceName}
        onSlugChange={setSpaceSlug}
        onClose={() => setEditingSpace(null)}
        onConfirm={() => void saveSpace()}
      />
      <MergeSpacesModal
        open={mergeSpaceOpen} spaces={spaces} admin
        onClose={() => setMergeSpaceOpen(false)}
        onMerged={(slug) => {
          setMergeSpaceOpen(false);
          setDetail(null);
          void loadSpaces();
          setMessage(`空间合并成功，新入口：/s/${slug}`);
        }}
      />
    </section>
  );
}
