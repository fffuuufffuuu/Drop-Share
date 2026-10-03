import { useState } from "react";

import { api } from "../api";
import type { SpaceTag } from "../types";

export function TagFilter({
  tags, selectedId, onChange,
}: {
  tags: SpaceTag[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="space-tag-filter" aria-label="按标签筛选">
      <button type="button" className={!selectedId ? "space-folder-active" : ""}
        aria-pressed={!selectedId} onClick={() => onChange(null)}>全部作品</button>
      {tags.map((tag) => <button type="button" key={tag.id}
        className={selectedId === tag.id ? "space-folder-active" : ""}
        aria-pressed={selectedId === tag.id}
        onClick={() => onChange(tag.id)}>{tag.name}</button>)}
    </div>
  );
}

export function TagChips({ tags, tagIds }: { tags: SpaceTag[]; tagIds: string[] }) {
  const selected = tags.filter((tag) => tagIds.includes(tag.id));
  return selected.length
    ? <div className="space-tag-chips">{selected.map((tag) =>
        <span className="space-tag-chip" key={tag.id}>{tag.name}</span>)}</div>
    : <span className="hint">无标签</span>;
}

export function SpaceTagControls({
  spaceId, tags, selectedIds, activeTagId, onActiveTagChange, onSelectionClear, onRefresh, admin = false, manageTags = false,
}: {
  spaceId: string;
  tags: SpaceTag[];
  selectedIds: string[];
  activeTagId: string | null;
  onActiveTagChange: (id: string | null) => void;
  onSelectionClear: () => void;
  onRefresh: () => Promise<void>;
  admin?: boolean;
  manageTags?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [assignmentIds, setAssignmentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const base = admin ? `/admin/spaces/${spaceId}` : `/spaces/${spaceId}`;
  const canManageTags = admin || manageTags;

  async function createTag() {
    const name = newName.trim();
    if (!name) return setMessage("请输入标签名称");
    setBusy(true);
    try {
      await api.post(`${base}/tags`, { name });
      setNewName("");
      setMessage("标签已添加");
      await onRefresh();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "添加标签失败");
    } finally {
      setBusy(false);
    }
  }

  async function renameTag(tag: SpaceTag) {
    const name = window.prompt("新的标签名称", tag.name)?.trim();
    if (!name || name === tag.name) return;
    setBusy(true);
    try {
      await api.patch(`${base}/tags/${tag.id}`, { name });
      setMessage("标签已重命名");
      await onRefresh();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "重命名失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTag(tag: SpaceTag) {
    if (!window.confirm(`删除标签“${tag.name}”？作品不会删除。`)) return;
    setBusy(true);
    try {
      await api.delete(`${base}/tags/${tag.id}`);
      if (activeTagId === tag.id) onActiveTagChange(null);
      setAssignmentIds((current) => current.filter((id) => id !== tag.id));
      setMessage("标签已删除");
      await onRefresh();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "删除标签失败");
    } finally {
      setBusy(false);
    }
  }

  async function bulk(action: "addTags" | "delete") {
    if (!selectedIds.length) return;
    if (action === "delete" && !window.confirm(
      admin ? `永久删除选中的 ${selectedIds.length} 件作品？` : `删除选中的 ${selectedIds.length} 件作品？`,
    )) return;
    setBusy(true);
    try {
      await api.post(`${base}/deployments/bulk`, {
        action, ids: selectedIds,
        ...(action === "addTags" ? { tagIds: assignmentIds } : {}),
      });
      if (action === "addTags") setAssignmentIds([]);
      onSelectionClear();
      setMessage(action === "addTags" ? "标签已添加到选中作品" : "作品已删除");
      await onRefresh();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "批量操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-folder-controls" aria-label="空间标签与批量操作">
      {canManageTags && <>
        <div className="space-folder-create">
          <label htmlFor="new-space-tag">标签管理</label>
          <input id="new-space-tag" value={newName} maxLength={80}
            placeholder="新标签名称" onChange={(event) => setNewName(event.target.value)} />
          <button type="button" disabled={busy} onClick={() => void createTag()}>添加标签</button>
        </div>
        <div className="space-folder-list">
          {tags.map((tag) => <div className="space-folder-item" key={tag.id}>
            <label className="space-folder-item-select">
              <input type="checkbox" checked={assignmentIds.includes(tag.id)}
                onChange={() => setAssignmentIds((current) => current.includes(tag.id)
                  ? current.filter((id) => id !== tag.id) : [...current, tag.id])} />
              <span className="space-tag-chip">{tag.name}</span>
            </label>
            <div className="space-folder-item-actions">
              <button type="button" aria-label={`重命名标签${tag.name}`} disabled={busy}
                onClick={() => void renameTag(tag)}>✎</button>
              <button type="button" aria-label={`删除标签${tag.name}`} disabled={busy}
                onClick={() => void deleteTag(tag)}>×</button>
            </div>
          </div>)}
        </div>
      </>}
      <div className="space-folder-bulk">
        <span>已选 {selectedIds.length} 件作品</span>
        {canManageTags && <>
          <span className="hint">添加标签会保留作品原有的标签。</span>
          <button type="button" disabled={busy || !selectedIds.length || !assignmentIds.length}
            onClick={() => void bulk("addTags")}>为选中作品添加标签</button>
        </>}
        <button type="button" className="btn-danger" disabled={busy || !selectedIds.length}
          onClick={() => void bulk("delete")}>删除选中作品</button>
      </div>
      {message && <p className="message" role="status">{message}</p>}
    </section>
  );
}
