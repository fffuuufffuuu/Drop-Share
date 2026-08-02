import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { getCurrentUser } from "../auth";
import { UploadDropzone } from "../components/UploadDropzone";
import { WorkPreviewCard } from "../components/WorkPreviewCard";
import type { UploadEntry } from "../uploader";

type DeploymentItem = {
  id: string;
  title: string;
  publicSlug: string;
  ownerUserId: string | null;
  uploaderName: string;
};

type SpaceEntryData = {
  space: { id: string; name: string; slug: string; expiresAt: string };
  deployments: DeploymentItem[];
};

export function SpaceEntryPage() {
  const { spaceSlug } = useParams();
  const [data, setData] = useState<SpaceEntryData | null>(null);
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [modalError, setModalError] = useState("");

  const currentUser = getCurrentUser();
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
    setProjectName("");
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
        <p className="space-entry-expiration">
          空间内作品统一于 {new Date(data.space.expiresAt).toLocaleString()} 到期
        </p>
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

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>为此项目起一个名称</h3>
            <p className="hint">名称在该空间内不可与其他项目重复，仅用于显示。</p>
            <label>
              项目名称
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="例如：我的作品集"
                maxLength={80}
                autoFocus
              />
            </label>
            {modalError && <p className="message">{modalError}</p>}
            <div className="row">
              <button type="button" onClick={() => setModalOpen(false)}>
                取消
              </button>
              <button type="button" onClick={submitUploadWithName}>
                确认上传
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="message">{message}</p>
      <section className="space-work-section" aria-labelledby="space-work-title">
        <h2 id="space-work-title">空间内作品</h2>
        {data.deployments.length === 0 ? (
          <p className="empty-state">这个空间还没有作品</p>
        ) : (
          <div className="work-card-grid">
            {data.deployments.map((deployment) => (
              <WorkPreviewCard
                key={deployment.id}
                title={deployment.title}
                publicSlug={deployment.publicSlug}
                meta={`上传者：${deployment.uploaderName}`}
                actions={
                  currentUser?.role === "ADMIN" ? (
                    <div className="work-admin-actions">
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
                    </div>
                  ) : currentUser && deployment.ownerUserId === currentUser.id ? (
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => closeDeployment(deployment.id)}
                    >
                      关闭
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
