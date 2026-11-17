import { useEffect, useState, type FormEvent } from "react";

import { api } from "../api";
import type { Space } from "../types";

type MergeSpaceOption = Space & { ownerUserId?: string; ownerUsername?: string };

export function MergeSpacesModal({
  open,
  spaces,
  admin = false,
  onClose,
  onMerged,
}: {
  open: boolean;
  spaces: MergeSpaceOption[];
  admin?: boolean;
  onClose: () => void;
  onMerged: (slug: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [nameCustomized, setNameCustomized] = useState(false);
  const [slugCustomized, setSlugCustomized] = useState(false);
  const [sourceDisposition, setSourceDisposition] = useState<"keep" | "remove">("keep");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const activeSpaces = spaces.filter((space) => new Date(space.expiresAt) > new Date());
  const firstSelected = activeSpaces.find((space) => space.id === selectedIds[0]);
  const selectableOwnerId = firstSelected?.ownerUserId;
  const slugMatchesKeptSource = sourceDisposition === "keep"
    && selectedIds.some((id) => activeSpaces.find((space) => space.id === id)?.slug === slug.trim());

  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setName("");
    setSlug("");
    setNameCustomized(false);
    setSlugCustomized(false);
    setSourceDisposition("keep");
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!firstSelected) {
      setName("");
      setSlug("");
      setNameCustomized(false);
      setSlugCustomized(false);
      return;
    }
    if (!nameCustomized) setName(firstSelected.name);
    if (!slugCustomized) setSlug(firstSelected.slug);
  }, [open, firstSelected, nameCustomized, slugCustomized]);

  if (!open) return null;

  function toggleSpace(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const uniqueIds = [...new Set(selectedIds)];
    if (uniqueIds.length < 2) {
      setError("请选择至少两个不同的有效空间");
      return;
    }
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName || trimmedName.length > 80 || (trimmedSlug && !/^[a-z0-9-]{2,40}$/.test(trimmedSlug))) {
      setError("新空间名称须为 1 至 80 个字；网址后缀须为 2 至 40 位小写字母、数字或连字符");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post<{ slug: string }>(admin ? "/admin/spaces/merge" : "/spaces/merge", {
        sourceIds: uniqueIds,
        name: trimmedName,
        ...(trimmedSlug ? { slug: trimmedSlug } : {}),
        sourceDisposition,
      });
      onMerged(data.slug);
    } catch (caught: any) {
      setError(caught.response?.data?.message || "合并空间失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-modal-overlay" role="presentation">
      <form className="admin-modal merge-spaces-modal" role="dialog" aria-modal="true"
        aria-label="合并空间" onSubmit={(event) => void submit(event)}>
        <h3>合并空间</h3>
        <p>所选空间的作品会分别获得以原空间命名的标签。新空间的到期时间取其中最晚的日期。</p>
        <span className="merge-space-options-label" id="merge-space-options-label">选择要合并的空间</span>
        <div className="merge-space-options" role="group" aria-labelledby="merge-space-options-label">
          {activeSpaces.map((space) => {
            const checked = selectedIds.includes(space.id);
            const disabled = Boolean(admin && selectableOwnerId && space.ownerUserId !== selectableOwnerId);
            return (
              <label key={space.id} className={`merge-space-option${checked ? " selected" : ""}${disabled ? " disabled" : ""}`}>
                <input type="checkbox" checked={checked} disabled={disabled}
                  onChange={() => toggleSpace(space.id)} />
                <span className="space-tag-chip">
                  {space.name} (/{space.slug}){admin ? ` · ${space.ownerUsername}` : ""}
                </span>
              </label>
            );
          })}
        </div>
        {admin && <p className="hint">仅能合并同一创建者的空间，新空间归该创建者。</p>}
        <label htmlFor="merge-space-name">新空间名称</label>
        <input id="merge-space-name" value={name} maxLength={80} onChange={(event) => {
          setNameCustomized(true);
          setName(event.target.value);
        }} />
        <label htmlFor="merge-space-slug">网址后缀（可选）</label>
        <input id="merge-space-slug" value={slug} maxLength={40} placeholder="留空自动生成"
          onChange={(event) => {
            setSlugCustomized(true);
            setSlug(event.target.value);
          }} />
        {slugMatchesKeptSource && (
          <p className="hint">保留原空间时，该网址后缀仍归原空间使用，新空间将自动分配新的后缀。</p>
        )}
        <label htmlFor="merge-source-disposition">原空间处理方式</label>
        <select id="merge-source-disposition" value={sourceDisposition}
          onChange={(event) => setSourceDisposition(event.target.value as "keep" | "remove")}>
          <option value="keep">保留原空间，复制作品到新空间</option>
          <option value="remove">删除原空间，迁移作品到新空间</option>
        </select>
        <p className="hint">
          {sourceDisposition === "keep"
            ? "原空间和原作品链接保持可用；新空间中的作品是独立副本，可能需要额外存储空间。"
            : "原空间入口链接将失效；作品原有公开链接保持可用。"}
          作品原有标签也会保留。
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="admin-modal-actions">
          <button type="button" disabled={submitting} onClick={onClose}>取消</button>
          <button type="submit" disabled={submitting}>{submitting ? "正在合并…" : "确认合并"}</button>
        </div>
      </form>
    </div>
  );
}
