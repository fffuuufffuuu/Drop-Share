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
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sourceDisposition, setSourceDisposition] = useState<"keep" | "remove">("keep");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const activeSpaces = spaces.filter((space) => new Date(space.expiresAt) > new Date());
  const first = activeSpaces.find((space) => space.id === firstId);
  const secondOptions = activeSpaces.filter((space) =>
    space.id !== firstId && (!admin || !first || space.ownerUserId === first.ownerUserId));

  useEffect(() => {
    if (!open) return;
    setFirstId("");
    setSecondId("");
    setName("");
    setSlug("");
    setSourceDisposition("keep");
    setError("");
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstId || !secondId || firstId === secondId) {
      setError("请选择两个不同的有效空间");
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
        sourceIds: [firstId, secondId],
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
        <p>两个原空间的作品会分别获得以原空间命名的标签。新空间的到期时间取两者中较晚的日期。</p>
        <label htmlFor="merge-first-space">第一个空间</label>
        <select id="merge-first-space" value={firstId} onChange={(event) => {
          setFirstId(event.target.value);
          setSecondId("");
        }}>
          <option value="">请选择空间</option>
          {activeSpaces.map((space) => <option key={space.id} value={space.id}>
            {space.name} (/{space.slug}){admin ? ` · ${space.ownerUsername}` : ""}
          </option>)}
        </select>
        <label htmlFor="merge-second-space">第二个空间</label>
        <select id="merge-second-space" value={secondId} onChange={(event) => setSecondId(event.target.value)}>
          <option value="">请选择空间</option>
          {secondOptions.map((space) => <option key={space.id} value={space.id}>
            {space.name} (/{space.slug}){admin ? ` · ${space.ownerUsername}` : ""}
          </option>)}
        </select>
        {admin && <p className="hint">仅能合并同一创建者的两个空间，新空间归该创建者。</p>}
        <label htmlFor="merge-space-name">新空间名称</label>
        <input id="merge-space-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        <label htmlFor="merge-space-slug">网址后缀（可选）</label>
        <input id="merge-space-slug" value={slug} maxLength={40} placeholder="留空自动生成"
          onChange={(event) => setSlug(event.target.value)} />
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
