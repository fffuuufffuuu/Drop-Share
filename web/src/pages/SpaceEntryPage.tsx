import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import { UploadDropzone } from "../components/UploadDropzone";
import type { UploadEntry } from "../uploader";

type DeploymentItem = {
  id: string;
  title: string;
  publicSlug: string;
  ownerUserId: string | null;
};

type SpaceEntryData = {
  space: { id: string; name: string; slug: string; expiresAt: string };
  deployments: DeploymentItem[];
};

function getCurrentUser(): { id: string } | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

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

  if (!data) {
    return <section className="card">加载中...</section>;
  }

  return (
    <section className="card space-entry">
      <h2>{data.space.name} 空间入口</h2>
      <p className="hint">
        将要发布的静态站点上传到这里，系统会自动为该空间生成一个临时访问链接。
      </p>
      <p className="retention-note retention-note--user">
        空间内作品统一于 {new Date(data.space.expiresAt).toLocaleString()} 到期
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
      <h3>空间内项目</h3>
      <ul className="deployment-list">
        {data.deployments.map((deployment) => (
          <li key={deployment.id} className="deployment-item">
            <a href={`${window.location.origin}/p/${deployment.publicSlug}`} target="_blank" rel="noreferrer">
              {deployment.title}
            </a>
            {currentUser && deployment.ownerUserId === currentUser.id && (
              <button
                type="button"
                className="btn-close"
                onClick={() => closeDeployment(deployment.id)}
                title="关闭并删除该项目，释放临时链接"
              >
                关闭
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
