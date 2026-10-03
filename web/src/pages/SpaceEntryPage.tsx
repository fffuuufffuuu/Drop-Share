import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser } from "../auth";
import { UploadDropzone } from "../components/UploadDropzone";
import { ProjectNameModal } from "../components/ProjectNameModal";
import { EditNameButton } from "../components/EditNameButton";
import { WorkPreviewCard } from "../components/WorkPreviewCard";
import { TagChips, TagFilter } from "../components/SpaceTagControls";
import type { SpaceTag } from "../types";
import { suggestProjectName, type UploadEntry } from "../uploader";
import { isDeadlineNear } from "../space-deadline";

type DeploymentItem = {
  id: string;
  title: string;
  publicSlug: string;
  ownerUserId: string | null;
  uploaderName: string;
  tagIds: string[];
};

type SpaceEntryData = {
  space: { id: string; name: string; slug: string; ownerUserId: string; expiresAt: string; downloadsEnabled: boolean };
  deployments: DeploymentItem[];
  tags: SpaceTag[];
};

export function SpaceEntryPage() {
  const { spaceSlug } = useParams();
  const [data, setData] = useState<SpaceEntryData | null>(null);
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [modalError, setModalError] = useState("");
  const [renameTarget, setRenameTarget] = useState<DeploymentItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const visibleDeployments = data?.deployments.filter((deployment) =>
    selectedTags.every((tagId) => (deployment.tagIds ?? []).includes(tagId))) ?? [];

  const currentUser = getCurrentUser();
  const canManageSpace = !!data && !!currentUser && (currentUser.role === "ADMIN" || currentUser.id === data.space.ownerUserId);
  useEffect(() => {
    setAuthToken(localStorage.getItem("token") ?? undefined);
  }, []);

  async function load() {
    if (!spaceSlug) return;
    try {
      const response = await api.get(`/spaces/entry/${spaceSlug}`);
      setData(response.data);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "空间不存在");
    }
  }

  useEffect(() => {
    void load();
  }, [spaceSlug]);

  function openUploadModal() {
    setProjectName(suggestProjectName(entries));
    setModalError("");
    setModalOpen(true);
  }

  async function submitUploadWithName() {
    const name = projectName.trim();
    if (!name) {
      setModalError("请输入项目名称");
      return;
    }
    if (name.length > 80) {
      setModalError("项目名称最多 80 字");
      return;
    }
    if (!data || !entries.length) {
      setModalOpen(false);
      return;
    }
    const formData = new FormData();
    formData.append("title", name);
    entries.forEach((entry) => {
      formData.append("files", entry.file);
      formData.append("paths", entry.path);
    });
    try {
      const response = await api.post(`/spaces/${data.space.id}/deployments`, formData);
      setMessage(`上传成功：${response.data.url}`);
      setEntries([]);
      setModalOpen(false);
      await load();
    } catch (error: any) {
      setModalError(error.response?.data?.message || "上传失败");
    }
  }

  async function closeDeployment(deploymentId: string) {
    if (!confirm("关闭后将删除内容并释放链接，确定继续？")) return;
    try {
      await api.delete(`/deployments/${deploymentId}`);
      setMessage("已关闭该项目");
      await load();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "关闭失败");
    }
  }

  function openRename(deployment: DeploymentItem) {
    setRenameTarget(deployment);
    setRenameValue(deployment.title);
    setRenameError("");
  }

  async function renameDeployment() {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title || title.length > 80) {
      setRenameError("作品名称须为 1 至 80 个字");
      return;
    }
    try {
      await api.patch(`/deployments/${renameTarget.id}`, { title });
      setData((current) => current ? {
        ...current,
        deployments: current.deployments.map((item) => item.id === renameTarget.id ? { ...item, title } : item),
      } : current);
      setRenameTarget(null);
      setMessage("作品名称已更新");
    } catch (error: any) {
      setRenameError(error.response?.data?.message || "重命名失败");
    }
  }

  async function hideAsAdmin(deploymentId: string) {
    try {
      await api.patch(`/admin/deployments/${deploymentId}`, { visibility: "hidden" });
      setData((current) => current ? {
        ...current,
        deployments: current.deployments.filter((item) => item.id !== deploymentId),
      } : current);
      setMessage("作品已隐藏，可在空间项目管理中恢复");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "隐藏作品失败");
    }
  }

  async function deleteAsAdmin(deploymentId: string) {
    if (!confirm("此操作将永久删除该作品，无法恢复。确定继续吗？")) return;
    try {
      await api.delete(`/admin/deployments/${deploymentId}`);
      setData((current) => current ? {
        ...current,
        deployments: current.deployments.filter((item) => item.id !== deploymentId),
      } : current);
      setMessage("作品已永久删除");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "删除作品失败");
    }
  }

  if (!data) {
    return <section className="card">加载中...</section>;
  }

  return (
    <section className="card space-entry">
      <header className="space-entry-hero">
        <span className="space-entry-eyebrow">作品空间</span>
        <h1 className="space-entry-title">{data.space.name}</h1>
        <div className="space-entry-deadline-row">
          <p className={`space-entry-expiration${isDeadlineNear(data.space.expiresAt) ? " deadline-near" : ""}`}>
            空间内作品统一于 {new Date(data.space.expiresAt).toLocaleString()} 到期
          </p>
          {canManageSpace && <Link className="space-entry-manage-link"
            to={currentUser?.role === "ADMIN" ? `/admin?spaceId=${encodeURIComponent(data.space.id)}` : `/spaces/${data.space.id}`}>
            管理页面
          </Link>}
        </div>
      </header>
      <p className="hint">
        将要发布的静态站点上传到这里，系统会自动为该空间生成一个临时访问链接。
      </p>

      <UploadDropzone
        entries={entries}
        onEntriesChange={setEntries}
        onError={setMessage}
      />
      <button type="button" onClick={openUploadModal} disabled={!entries.length}>
        上传到该空间
      </button>

      <ProjectNameModal
        open={modalOpen}
        value={projectName}
        error={modalError}
        hint="名称在该空间内不可与其他项目重复，仅用于显示。"
        confirmLabel="确认上传"
        onChange={setProjectName}
        onClose={() => setModalOpen(false)}
        onConfirm={() => void submitUploadWithName()}
      />

      <ProjectNameModal
        open={renameTarget !== null}
        title="重命名作品"
        value={renameValue}
        error={renameError}
        hint="名称在该空间内不可与其他作品重复。"
        confirmLabel="保存名称"
        onChange={setRenameValue}
        onClose={() => setRenameTarget(null)}
        onConfirm={() => void renameDeployment()}
      />

      <p className="message">{message}</p>
      <section className="space-work-section" aria-labelledby="space-work-title">
        <h2 id="space-work-title">空间内作品</h2>
        {(data.tags ?? []).length > 0 && <TagFilter tags={data.tags} selectedIds={selectedTags}
          onChange={setSelectedTags} />}
        {visibleDeployments.length === 0 ? (
          <p className="empty-state">{data.deployments.length ? "没有符合所选标签的作品" : "这个空间还没有作品"}</p>
        ) : <div className="work-card-grid">
            {visibleDeployments.map((deployment) => (
              <WorkPreviewCard
                key={deployment.id}
                title={deployment.title}
                publicSlug={deployment.publicSlug}
                cardLink
                titleAction={currentUser && (
                  currentUser.id === data.space.ownerUserId || currentUser.id === deployment.ownerUserId
                ) ? <EditNameButton label={`重命名${deployment.title}`} onClick={() => openRename(deployment)} /> : undefined}
                meta={<div className="space-work-card-meta">
                  <div className="space-work-card-byline">
                    <span className="space-work-card-uploader">上传者：{deployment.uploaderName}</span>
                    {(data.space.downloadsEnabled || currentUser?.role === "ADMIN"
                      || (currentUser && deployment.ownerUserId === currentUser.id)) && <div className="work-admin-actions">
                    {data.space.downloadsEnabled && <a className="work-icon-action"
                      aria-label={`下载${deployment.title} ZIP`} title="下载 ZIP"
                      href={`${String(api.defaults.baseURL ?? "/api").replace(/\/$/, "")}/spaces/entry/${encodeURIComponent(data.space.slug)}/deployments/${encodeURIComponent(deployment.id)}/download`}
                    ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3" /></svg></a>}
                    {currentUser?.role === "ADMIN" ? (<>
                      <button
                        type="button"
                        className="work-icon-action"
                        aria-label={`隐藏${deployment.title}`}
                        title="隐藏作品"
                        onClick={() => void hideAsAdmin(deployment.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.9 10.9 0 0112 4c5.5 0 9 5.5 9 5.5a14.4 14.4 0 01-2.1 2.7M6.2 6.2C3.9 7.7 3 9.5 3 9.5S6.5 15 12 15c1 0 2-.2 2.8-.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="work-icon-action work-icon-action-danger"
                        aria-label={`删除${deployment.title}`}
                        title="永久删除作品"
                        onClick={() => void deleteAsAdmin(deployment.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13M10 11v5m4-5v5" />
                        </svg>
                      </button>
                    </>) : currentUser && deployment.ownerUserId === currentUser.id ? (
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => closeDeployment(deployment.id)}
                    >
                      关闭
                    </button>
                  ) : null}
                    </div>}
                  </div>
                  {(data.tags ?? []).some((tag) => (deployment.tagIds ?? []).includes(tag.id)) &&
                    <TagChips tags={data.tags ?? []} tagIds={deployment.tagIds ?? []} />}
                </div>}
              />
            ))}
          </div>}
      </section>
    </section>
  );
}
