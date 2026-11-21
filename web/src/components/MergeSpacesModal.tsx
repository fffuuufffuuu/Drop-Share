import { useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "../api";
import type { Space } from "../types";

type MergeSpaceOption = Space & { ownerUserId?: string; ownerUsername?: string };
type FieldErrors = { name?: string; slug?: string };

const creatorLabel = (space: MergeSpaceOption) => space.ownerUsername?.trim() || "我";

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
  const [sourceDisposition, setSourceDisposition] = useState<"keep" | "remove">("remove");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [creatorFilter, setCreatorFilter] = useState("");
  const activeSpaces = spaces.filter((space) => new Date(space.expiresAt) > new Date());
  const firstSelected = activeSpaces.find((space) => space.id === selectedIds[0]);
  const selectableOwnerId = firstSelected?.ownerUserId;
  const creators = useMemo(() => [...new Set(activeSpaces.map(creatorLabel))], [activeSpaces]);
  const visibleSpaces = creatorFilter
    ? activeSpaces.filter((space) => creatorLabel(space) === creatorFilter)
    : activeSpaces;

  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setName("");
    setSlug("");
    setSourceDisposition("remove");
    setError("");
    setFieldErrors({});
    setSubmitting(false);
    setChecking(false);
    setConfirming(false);
    setFilterOpen(false);
    setCreatorFilter("");
  }, [open]);

  if (!open) return null;

  function toggleSpace(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  function clearMessages() {
    setError("");
    setFieldErrors({});
  }

  function validateLocally(): FieldErrors | string {
    const uniqueIds = [...new Set(selectedIds)];
    if (uniqueIds.length < 2) return "请选择至少两个不同的有效空间";
    const selected = uniqueIds.map((id) => activeSpaces.find((space) => space.id === id));
    if (selected.some((space) => !space)) return "请选择至少两个不同的有效空间";
    if (selected.some((space) => space!.ownerUserId && selected[0]!.ownerUserId && space!.ownerUserId !== selected[0]!.ownerUserId)) {
      return "只能合并同一创建者的空间";
    }
    const errors: FieldErrors = {};
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName || trimmedName.length > 80) {
      errors.name = "新空间名称须为 1 至 80 个字，请修改后再合并";
    }
    if (trimmedSlug && !/^[a-z0-9-]{2,40}$/.test(trimmedSlug)) {
      errors.slug = "网址后缀须为 2 至 40 位小写字母、数字或连字符，请修改后再合并";
    }
    return errors;
  }

  async function requestMerge() {
    const uniqueIds = [...new Set(selectedIds)];
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    setSubmitting(true);
    clearMessages();
    try {
      const { data } = await api.post<{ slug: string }>(admin ? "/admin/spaces/merge" : "/spaces/merge", {
        sourceIds: uniqueIds,
        name: trimmedName,
        ...(trimmedSlug ? { slug: trimmedSlug } : {}),
        sourceDisposition,
      });
      setConfirming(false);
      onMerged(data.slug);
    } catch (caught: any) {
      const payload = caught.response?.data;
      const nextErrors = payload?.errors as FieldErrors | undefined;
      setConfirming(false);
      if (nextErrors?.name || nextErrors?.slug) {
        setFieldErrors(nextErrors);
        setError(payload?.message && payload.message !== nextErrors.name && payload.message !== nextErrors.slug
          ? payload.message
          : "");
      } else {
        setError(payload?.message || "合并空间失败，请重试");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onMergeClick(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || checking) return;
    const local = validateLocally();
    if (typeof local === "string") {
      setFieldErrors({});
      setError(local);
      setConfirming(false);
      return;
    }
    if (local.name || local.slug) {
      setFieldErrors(local);
      setError("");
      setConfirming(false);
      return;
    }
    setChecking(true);
    clearMessages();
    try {
      const trimmedSlug = slug.trim();
      await api.post(admin ? "/admin/spaces/merge/availability" : "/spaces/merge/availability", {
        sourceIds: [...new Set(selectedIds)],
        name: name.trim(),
        ...(trimmedSlug ? { slug: trimmedSlug } : {}),
        sourceDisposition,
      });
      setConfirming(true);
    } catch (caught: any) {
      const payload = caught.response?.data;
      const nextErrors = payload?.errors as FieldErrors | undefined;
      if (nextErrors?.name || nextErrors?.slug) {
        setFieldErrors(nextErrors);
        setError(payload?.message && payload.message !== nextErrors.name && payload.message !== nextErrors.slug
          ? payload.message
          : "");
      } else {
        setError(payload?.message || "无法检查新空间名称或网址后缀，请重试");
      }
      setConfirming(false);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="admin-modal-overlay" role="presentation">
      <form className="admin-modal merge-spaces-modal" role="dialog" aria-modal="true"
        aria-labelledby="merge-spaces-title" onSubmit={(event) => void onMergeClick(event)}>
        <div className="merge-spaces-modal-header">
          <h3 id="merge-spaces-title">合并空间</h3>
        </div>
        <div className="merge-spaces-modal-body">
          <p className="hint">所选空间的作品会分别获得以原空间命名的标签。新空间的到期时间取其中最晚的日期。</p>
          <div className="merge-space-options-heading">
            <span className="merge-space-options-label" id="merge-space-options-label">选择要合并的空间</span>
            <p className="hint merge-space-owner-hint">仅能合并同一创建者的空间，新空间归该创建者。</p>
            <div className="merge-space-filter">
              <button type="button" className={creatorFilter ? "active" : undefined}
                aria-expanded={filterOpen} aria-haspopup="listbox"
                onClick={() => setFilterOpen((current) => !current)}>
                {creatorFilter ? `筛选：${creatorFilter}` : "筛选"}
              </button>
              {filterOpen && (
                <ul className="merge-space-filter-menu" role="listbox" aria-label="按创建者筛选">
                  <li>
                    <button type="button" role="option" aria-selected={!creatorFilter}
                      onClick={() => { setCreatorFilter(""); setFilterOpen(false); }}>全部</button>
                  </li>
                  {creators.map((creator) => (
                    <li key={creator}>
                      <button type="button" role="option" aria-selected={creatorFilter === creator}
                        onClick={() => { setCreatorFilter(creator); setFilterOpen(false); }}>
                        {creator}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="merge-space-options" role="group" aria-labelledby="merge-space-options-label">
            {visibleSpaces.map((space) => {
              const checked = selectedIds.includes(space.id);
              const disabled = Boolean(admin && selectableOwnerId && space.ownerUserId !== selectableOwnerId);
              return (
                <button key={space.id} type="button" role="checkbox" aria-checked={checked}
                  disabled={disabled}
                  className={`space-tag-chip merge-space-option${checked ? " selected" : ""}${disabled ? " disabled" : ""}`}
                  onClick={() => { if (!disabled) toggleSpace(space.id); }}>
                  <strong className="merge-space-name">{space.name}</strong>
                  <span className="merge-space-meta"> (/{space.slug}){admin ? ` · ${space.ownerUsername}` : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="merge-spaces-fields-row">
            <div className="merge-spaces-field">
              <label htmlFor="merge-space-name">新空间名称</label>
              <input id="merge-space-name" value={name} maxLength={80} aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "merge-space-name-error" : undefined}
                onChange={(event) => { setName(event.target.value); if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined })); }} />
              {fieldErrors.name && <p id="merge-space-name-error" className="merge-spaces-field-error" role="alert">{fieldErrors.name}</p>}
            </div>
            <div className="merge-spaces-field">
              <label htmlFor="merge-space-slug">网址后缀（可选）</label>
              <input id="merge-space-slug" value={slug} maxLength={40} placeholder="留空自动生成"
                aria-invalid={Boolean(fieldErrors.slug)}
                aria-describedby={fieldErrors.slug ? "merge-space-slug-error" : undefined}
                onChange={(event) => {
                  setSlug(event.target.value);
                  if (fieldErrors.slug) setFieldErrors((current) => ({ ...current, slug: undefined }));
                }} />
              {fieldErrors.slug && <p id="merge-space-slug-error" className="merge-spaces-field-error" role="alert">{fieldErrors.slug}</p>}
            </div>
          </div>
          <label htmlFor="merge-source-disposition">原空间处理方式</label>
          <select id="merge-source-disposition" value={sourceDisposition}
            onChange={(event) => setSourceDisposition(event.target.value as "keep" | "remove")}>
            <option value="remove">删除原空间，迁移作品到新空间</option>
            <option value="keep">保留原空间，复制作品到新空间</option>
          </select>
          <p className="hint">
            {sourceDisposition === "keep"
              ? "原空间和原作品链接保持可用；新空间中的作品是独立副本，可能需要额外存储空间。"
              : "原空间入口链接将失效；作品原有公开链接保持可用。"}
            作品原有标签也会保留。
          </p>
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="admin-modal-actions">
          <button type="button" disabled={submitting || checking} onClick={onClose}>取消</button>
          <button type="submit" disabled={submitting || checking}>
            {checking ? "正在检查…" : submitting ? "正在合并…" : "合并"}
          </button>
        </div>
      </form>
      {confirming && (
        <div className="merge-spaces-confirm-overlay" role="presentation"
          onClick={(event) => { if (event.target === event.currentTarget && !submitting) setConfirming(false); }}>
          <div className="merge-spaces-confirm-dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="merge-spaces-confirm-title">
            <p id="merge-spaces-confirm-title">确定要合并这{selectedIds.length}个空间吗？</p>
            <div className="merge-spaces-confirm-actions">
              <button type="button" disabled={submitting} onClick={() => setConfirming(false)}>取消</button>
              <button type="button" disabled={submitting} onClick={() => void requestMerge()}>
                {submitting ? "正在合并…" : "确认合并"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
