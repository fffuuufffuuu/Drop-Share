import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, setAuthToken } from "../api";
import type { UploadEntry } from "../uploader";
import { ProjectNameModal } from "../components/ProjectNameModal";
import { EditNameButton } from "../components/EditNameButton";
import { EditSpaceModal } from "../components/EditSpaceModal";
import { SpaceDownloadSwitch } from "../components/SpaceDownloadSwitch";
import { SpaceTagControls, TagChips, TagFilter } from "../components/SpaceTagControls";
import { downloadZip } from "../download";
import { isDeadlineNear } from "../space-deadline";
import type { SpaceDeployment, SpaceTag } from "../types";

type BatchReportItem = { title: string; ok: boolean; message?: string };

type SpaceDetail = {
  id: string;
  name: string;
  slug: string;
  expiresAt: string;
  downloadsEnabled: boolean;
  deployments: SpaceDeployment[];
  tags: SpaceTag[];
};

const MAX_BATCH_UPLOAD_BYTES = 2000 * 1024 * 1024;

export function SpacePage() {
  const { spaceId } = useParams();
  const [detail, setDetail] = useState<SpaceDetail | null>(null);
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SpaceDeployment | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [spaceEditOpen, setSpaceEditOpen] = useState(false);
  const [spaceName, setSpaceName] = useState("");
  const [spaceError, setSpaceError] = useState("");
  const [batchReport, setBatchReport] = useState<BatchReportItem[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const visibleDeployments = detail?.deployments.filter((deployment) =>
    !tagFilter || (deployment.tagIds ?? []).includes(tagFilter)) ?? [];

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length < 200 ? [...current, id] : current);
  }

  async function loadDetail() {
    if (!spaceId) return;
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("请先登录。");
      return;
    }
    setAuthToken(token);
    const { data } = await api.get(`/spaces/${spaceId}`);
    setDetail(data);
  }

  useEffect(() => {
    void loadDetail();
  }, [spaceId]);

  async function toggleVisibility(id: string, value: "visible" | "hidden") {
    try {
      await api.patch(`/deployments/${id}`, { visibility: value });
      await loadDetail();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "修改失败");
    }
  }

  async function toggleDownloads(enabled: boolean) {
    if (!detail) return;
    try {
      await api.patch(`/spaces/${detail.id}/downloads`, { downloadsEnabled: enabled });
      setDetail({ ...detail, downloadsEnabled: enabled });
      setMessage("");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "修改下载权限失败");
    }
  }

  async function downloadDeployment(deployment: SpaceDeployment) {
    if (!detail) return;
    try {
      await downloadZip(`/spaces/${detail.id}/deployments/${deployment.id}/download`, `${deployment.title}.zip`);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "下载失败");
    }
  }

  async function removeDeployment(id: string) {
    try {
      await api.delete(`/deployments/${id}`);
      await loadDetail();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "删除失败");
    }
  }

  function openRename(deployment: SpaceDeployment) {
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
      setRenameTarget(null);
      setMessage("项目名称已更新");
      await loadDetail();
    } catch (error: any) {
      setRenameError(error.response?.data?.message || "重命名失败");
    }
  }

  async function saveSpaceName() {
    if (!detail) return;
    const name = spaceName.trim();
    if (!name || name.length > 80) {
      setSpaceError("空间名称须为 1 至 80 个字");
      return;
    }
    try {
      await api.patch(`/spaces/${detail.id}`, { name });
      setDetail({ ...detail, name });
      setSpaceEditOpen(false);
      setMessage("空间名称已更新");
    } catch (error: any) {
      setSpaceError(error.response?.data?.message || "修改空间名称失败");
    }
  }

  async function batchUpload() {
    if (!spaceId || !entries.length) return;
    if (entries.reduce((total, entry) => total + entry.file.size, 0) > MAX_BATCH_UPLOAD_BYTES) {
      setMessage("单次批量上传的文件总大小不能超过 2000 MB");
      return;
    }
    const formData = new FormData();
    entries.forEach((entry) => {
      formData.append("files", entry.file);
      formData.append("paths", entry.path);
    });
    try {
      setUploading(true);
      const { data } = await api.post(`/spaces/${spaceId}/deployments/batch-upload`, formData);
      const succeeded = (data.deployments as Array<{ title?: string }> | undefined) ?? [];
      const failed = (data.failures as Array<{ title?: string; message?: string }> | undefined) ?? [];
      setBatchReport([
        ...succeeded.map((item) => ({ title: item.title || "未命名作品", ok: true })),
        ...failed.map((item) => ({ title: item.title || "未命名作品", ok: false, message: item.message })),
      ]);
      setMessage("");
      setEntries([]);
      await loadDetail();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "批量部署失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="card">
      <p className="space-management-kicker">空间项目管理</p>
      {detail ? (
        <>
          <div className="space-management-heading">
            <div>
              <h1><Link to={`/s/${detail.slug}`}>{detail.name}</Link></h1>
              <p>/{detail.slug}</p>
            </div>
            <button type="button" className="space-name-edit" onClick={() => {
              setSpaceName(detail.name);
              setSpaceError("");
              setSpaceEditOpen(true);
            }}>修改空间名称</button>
          </div>
          <p className={`retention-note retention-note--user${isDeadlineNear(detail.expiresAt) ? " deadline-near" : ""}`}>
            空间内作品统一于 {new Date(detail.expiresAt).toLocaleString()} 到期
          </p>
          <div className="space-batch-upload">
            <div className="space-batch-actions">
              <label className="space-batch-picker">选择 HTML 文件
                <input type="file" accept=".html,.htm,text/html" multiple onChange={(event) => {
                  setEntries(Array.from(event.target.files ?? [], (file) => ({ file, path: file.name })));
                  setMessage("");
                  event.target.value = "";
                }} />
              </label>
              <label className="space-batch-picker">选择整个文件夹
                <input type="file" multiple
                  // @ts-expect-error webkitdirectory is available in Chromium-based browsers
                  webkitdirectory="true"
                  onChange={(event) => {
                    setEntries(Array.from(event.target.files ?? [], (file) => ({
                      file, path: file.webkitRelativePath || file.name,
                    })));
                    setMessage("");
                    event.target.value = "";
                  }} />
              </label>
              <button type="button" onClick={batchUpload} disabled={!entries.length || uploading}>
                {uploading ? "上传中…" : "批量上传到空间"}
              </button>
              {entries.length > 0 && <span>已选择 {entries.length} 个文件（{(entries.reduce((total, entry) => total + entry.file.size, 0) / 1024 / 1024).toFixed(1)} MB）</span>}
            </div>
            <p className="space-batch-guidance">单次批量上传的文件总大小不超过 2000 MB。HTML 文件：每个文件生成一个项目，以文件名命名。文件夹：根目录有 index.html 时作为一个项目，以文件夹名命名；没有 index.html 时，用该文件夹里唯一的 HTML 文件作为主页。多个项目请放在同一父文件夹内，并分别以子文件夹名命名。图片、脚本等资源放在对应项目文件夹内。</p>
          </div>
          <SpaceDownloadSwitch enabled={detail.downloadsEnabled ?? false}
            onToggle={(enabled) => void toggleDownloads(enabled)} />
          <SpaceTagControls
            manageTags spaceId={detail.id} tags={detail.tags ?? []} selectedIds={selectedIds}
            activeTagId={tagFilter} onActiveTagChange={setTagFilter}
            onSelectionClear={() => setSelectedIds([])} onRefresh={loadDetail}
          />
          <section className="space-work-list-panel" aria-label="空间作品列表">
            <TagFilter tags={detail.tags ?? []} selectedId={tagFilter} onChange={setTagFilter} />
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="选择当前分类全部作品"
                  checked={visibleDeployments.length > 0 && visibleDeployments.every((item) => selectedIds.includes(item.id))}
                  onChange={(event) => setSelectedIds(event.target.checked
                    ? Array.from(new Set([...selectedIds, ...visibleDeployments.map((item) => item.id)])).slice(0, 200)
                    : selectedIds.filter((id) => !visibleDeployments.some((item) => item.id === id)))} /></th>
                <th>项目</th>
                <th>标签</th>
                <th>上传者</th>
                <th>可见性</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleDeployments.map((deployment) => (
                <tr key={deployment.id}>
                  <td><input type="checkbox" aria-label={`选择${deployment.title}`}
                    checked={selectedIds.includes(deployment.id)} onChange={() => toggleSelected(deployment.id)} /></td>
                  <td><span className="work-title-inline">{deployment.visibility === "visible" ? (
                    <a href={`/p/${deployment.publicSlug}/`} target="_blank" rel="noreferrer">{deployment.title}</a>
                  ) : <span title="先显示项目后访问">{deployment.title}</span>}
                    <EditNameButton label={`重命名${deployment.title}`} onClick={() => openRename(deployment)} />
                  </span></td>
                  <td><TagChips tags={detail.tags ?? []} tagIds={deployment.tagIds ?? []} /></td>
                  <td>{deployment.uploaderName}</td>
                  <td>{deployment.visibility === "visible" ? "显示" : "隐藏"}</td>
                  <td>
                    <div className="space-deployment-actions">
                      <button type="button" onClick={() => void downloadDeployment(deployment)}>下载 ZIP</button>
                      <button
                        type="button"
                        onClick={() =>
                          toggleVisibility(
                            deployment.id,
                            deployment.visibility === "visible" ? "hidden" : "visible",
                          )
                        }
                      >
                        显示/隐藏
                      </button>
                      <button type="button" onClick={() => removeDeployment(deployment.id)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </section>
        </>
      ) : (
        <p>加载中...</p>
      )}
      <ProjectNameModal
        open={renameTarget !== null}
        title="重命名作品"
        value={renameValue}
        error={renameError}
        hint="名称在该空间内不可与其他项目重复，仅用于显示。"
        confirmLabel="保存名称"
        onChange={setRenameValue}
        onClose={() => setRenameTarget(null)}
        onConfirm={() => void renameDeployment()}
      />
      <EditSpaceModal
        open={spaceEditOpen}
        name={spaceName}
        slug={detail?.slug ?? ""}
        allowSlug={false}
        error={spaceError}
        onNameChange={setSpaceName}
        onSlugChange={() => undefined}
        onClose={() => setSpaceEditOpen(false)}
        onConfirm={() => void saveSpaceName()}
      />
      <p className="message">{message}</p>
      {batchReport && (
        <div className="space-modal-overlay" role="presentation">
          <div className="space-modal" role="dialog" aria-modal="true" aria-labelledby="batch-report-title">
            <h2 id="batch-report-title">批量上传结果</h2>
            <ul className="batch-report-list">
              {batchReport.map((item) => (
                <li key={`${item.ok ? "ok" : "fail"}-${item.title}`}>
                  <strong>{item.title}</strong>
                  <span className={item.ok ? "batch-report-ok" : "batch-report-fail"}>
                    {item.ok ? "上传成功" : `上传失败${item.message ? `：${item.message}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-modal-actions">
              <button type="button" onClick={() => setBatchReport(null)}>知道了</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
